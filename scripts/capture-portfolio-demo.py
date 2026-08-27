from io import BytesIO
import sys
import time
from pathlib import Path


def main() -> None:
    from PIL import Image
    from selenium import webdriver
    from selenium.webdriver.common.action_chains import ActionChains
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    options = webdriver.ChromeOptions()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--enable-webgl')
    options.add_argument('--ignore-gpu-blocklist')
    options.add_argument('--enable-unsafe-swiftshader')
    options.add_argument('--use-gl=angle')
    options.add_argument('--use-angle=swiftshader')

    driver = webdriver.Chrome(options=options)
    frames: list[Image.Image] = []

    def capture(element) -> None:
        image = Image.open(BytesIO(element.screenshot_as_png)).convert('RGB')
        max_width = 920
        if image.width > max_width:
            height = round(image.height * max_width / image.width)
            image = image.resize((max_width, height), Image.Resampling.LANCZOS)
        frames.append(image)

    try:
        driver.set_window_size(1500, 1200)
        driver.get('http://127.0.0.1:4173')
        wait = WebDriverWait(driver, 30)
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, '.demo-shell')))
        wait.until(
            lambda d: d.find_element(By.CSS_SELECTOR, '.pipeline-status')
            .get_attribute('data-render-status') == 'ready'
        )

        demo = driver.find_element(By.CSS_SELECTOR, '.demo-shell')
        stage = driver.find_element(By.CSS_SELECTOR, '[data-testid="correction-stage"]')
        driver.execute_script(
            "arguments[0].scrollIntoView({block:'start',inline:'center'});",
            demo,
        )
        time.sleep(0.4)

        positions = [
            (-140, -70),
            (-70, -35),
            (0, 0),
            (80, 45),
            (145, 75),
            (90, -55),
            (0, 65),
            (-110, 55),
        ]

        for dx, dy in positions[:4]:
            ActionChains(driver).move_to_element(stage).move_by_offset(dx, dy).perform()
            time.sleep(0.24)
            capture(demo)

        directional = driver.find_element(By.XPATH, "//button[contains(., 'Directional')]")
        directional.click()
        wait.until(lambda d: d.find_element(By.ID, 'sphere').get_attribute('value') == '-1.75')
        time.sleep(0.3)

        for dx, dy in positions[4:]:
            ActionChains(driver).move_to_element(stage).move_by_offset(dx, dy).perform()
            time.sleep(0.24)
            capture(demo)

        compare = driver.find_element(By.XPATH, "//button[contains(., 'Hold for original')]")
        ActionChains(driver).move_to_element(compare).click_and_hold().perform()
        time.sleep(0.3)
        capture(demo)
        ActionChains(driver).release().perform()
        time.sleep(0.3)
        capture(demo)

        if len(frames) < 8:
            raise RuntimeError('Too few portfolio demo frames were captured')

        output = Path('docs/media/refract-correction-demo.gif')
        frames[0].save(
            output,
            save_all=True,
            append_images=frames[1:],
            duration=300,
            loop=0,
            optimize=True,
            disposal=2,
        )

        size_mb = output.stat().st_size / (1024 * 1024)
        print(f'Captured {len(frames)} authentic renderer frames, GIF size {size_mb:.2f} MiB')
        if size_mb > 9:
            raise RuntimeError(f'Portfolio GIF is too large: {size_mb:.2f} MiB')
    finally:
        driver.quit()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'Portfolio demo capture failed: {exc}', file=sys.stderr)
        raise
