import type { Status } from '../types'

export function Orb({ status }: { status: Status }) {
  return (
    <div className={`orb ${status}`} aria-hidden="true">
      <span className="orb-ring r1" />
      <span className="orb-ring r2" />
      <span className="orb-ring r3" />
      <span className="orb-core" />
      <span className="orb-bars">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
    </div>
  )
}
