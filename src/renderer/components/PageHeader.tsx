interface PageHeaderProps {
  title: string
  description?: string
  eyebrow?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  eyebrow,
  action,
  className = '',
}: PageHeaderProps) {
  return (
    <header className={`page-header ${className}`.trim()}>
      <div className="page-header__copy">
        {eyebrow && <div className="page-header__eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-header__description">{description}</p>}
      </div>
      {action && <div className="page-header__action">{action}</div>}
    </header>
  )
}

export default PageHeader
