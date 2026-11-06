import { shopName } from '@/lib/format'

// An item's link, shown as the shop's name and an arrow ("asos.com ↗"), opening in a new tab. Only
// a stored link is ever a link, and the database holds only http(s) ones. The words sit in one
// span: as a flex item of its own, the arrow's span would drop its leading space.
//
// A stored link that isn't a web address (shopName says null) shows nothing: no browser could open
// it, and the rest of the item still shows.
export function ShopLink({ url }: { url: string }) {
  const shop = shopName(url)
  if (shop === null) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center text-sm text-link"
    >
      <span>
        {shop}
        <span aria-hidden="true">{' ↗'}</span>
      </span>
    </a>
  )
}
