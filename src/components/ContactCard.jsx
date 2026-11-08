import { Mail, Phone, MapPin, Clock, Building2 } from 'lucide-react'
import { COMPANY, formatAddress } from '../data/companyInfo'

/**
 * Compact contact card with all legally-required identifying details.
 * Re-used across legal pages, the Help centre, and anywhere a
 * compliance-friendly "who we are" block is needed.
 */
const ContactCard = ({ className = '' }) => {
  return (
    <div className={`rounded-xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6 ${className}`}>
      <div className="flex items-start gap-3 mb-4">
        <Building2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-label-lg text-label-lg text-on-surface">{COMPANY.tradingName}</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {COMPANY.legalName} · Reg {COMPANY.regNumber}
          </p>
          {COMPANY.vatNumber && !COMPANY.vatNumber.startsWith('[TBC') && (
            <p className="font-body-sm text-body-sm text-on-surface-variant">VAT: {COMPANY.vatNumber}</p>
          )}
        </div>
      </div>

      <ul className="space-y-3 font-body-sm text-body-sm text-on-surface">
        <li className="flex items-start gap-3">
          <MapPin className="w-4 h-4 text-on-surface-variant mt-0.5 flex-shrink-0" />
          <span>{formatAddress()}</span>
        </li>
        <li className="flex items-start gap-3">
          <Mail className="w-4 h-4 text-on-surface-variant mt-0.5 flex-shrink-0" />
          <a href={`mailto:${COMPANY.email.support}`} className="text-primary hover:underline">
            {COMPANY.email.support}
          </a>
        </li>
        <li className="flex items-start gap-3">
          <Phone className="w-4 h-4 text-on-surface-variant mt-0.5 flex-shrink-0" />
          <a href={`tel:${COMPANY.phone.replace(/\s+/g, '')}`} className="text-primary hover:underline">
            {COMPANY.phone}
          </a>
        </li>
        <li className="flex items-start gap-3">
          <Clock className="w-4 h-4 text-on-surface-variant mt-0.5 flex-shrink-0" />
          <span>{COMPANY.hours}</span>
        </li>
      </ul>
    </div>
  )
}

export default ContactCard
