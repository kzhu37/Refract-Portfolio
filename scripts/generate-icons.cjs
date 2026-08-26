const { app, BrowserWindow } = require('electron')
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const projectRoot = resolve(__dirname, '..')
const sourcePath = join(projectRoot, 'src', 'renderer', 'src', 'assets', 'refract-prism.svg')
const outputDirectory = join(projectRoot, 'resources', 'icons')
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
let renderWindow

function buildPage(markup, { background, markWidth }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body {
        display: grid;
        place-items: center;
        background: ${background};
      }
      svg {
        display: block;
        width: ${markWidth};
        height: auto;
      }
    </style>
  </head>
  <body>${markup}</body>
</html>`
}

async function render(markup, options) {
  if (!renderWindow) {
    renderWindow = new BrowserWindow({
      width: 1024,
      height: 1024,
      useContentSize: true,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: { offscreen: true }
    })
    await renderWindow.loadURL('about:blank')
  }

  const page = buildPage(markup, options)
  await renderWindow.webContents.executeJavaScript(`
    document.open()
    document.write(${JSON.stringify(page)})
    document.close()
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  `)
  return renderWindow.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
}

function createIco(images) {
  const headerSize = 6
  const entrySize = 16
  const header = Buffer.alloc(headerSize + images.length * entrySize)

  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  let dataOffset = header.length
  images.forEach(({ size, png }, index) => {
    const offset = headerSize + index * entrySize
    header.writeUInt8(size === 256 ? 0 : size, offset)
    header.writeUInt8(size === 256 ? 0 : size, offset + 1)
    header.writeUInt8(0, offset + 2)
    header.writeUInt8(0, offset + 3)
    header.writeUInt16LE(1, offset + 4)
    header.writeUInt16LE(32, offset + 6)
    header.writeUInt32LE(png.length, offset + 8)
    header.writeUInt32LE(dataOffset, offset + 12)
    dataOffset += png.length
  })

  return Buffer.concat([header, ...images.map(({ png }) => png)])
}

app.whenReady().then(async () => {
  const prism = readFileSync(sourcePath, 'utf8')
  mkdirSync(outputDirectory, { recursive: true })

  const appIcon = await render(prism, {
    background: '#080c23',
    markWidth: '76%'
  })
  const trayIcon = await render(prism, {
    background: 'transparent',
    markWidth: '88%'
  })

  writeFileSync(
    join(outputDirectory, 'refract-icon.png'),
    appIcon.resize({ width: 512, height: 512, quality: 'best' }).toPNG()
  )
  writeFileSync(
    join(outputDirectory, 'refract-tray.png'),
    trayIcon.resize({ width: 32, height: 32, quality: 'best' }).toPNG()
  )

  const icoImages = icoSizes.map((size) => ({
    size,
    png: appIcon.resize({ width: size, height: size, quality: 'best' }).toPNG()
  }))
  writeFileSync(join(outputDirectory, 'refract-icon.ico'), createIco(icoImages))

  console.log(`Generated Refract icons in ${outputDirectory}`)
  console.log(`ICO sizes: ${icoSizes.join(', ')} px`)
  renderWindow.destroy()
  app.quit()
}).catch((error) => {
  console.error(error)
  process.exitCode = 1
  app.quit()
})
