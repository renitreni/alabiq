import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Fixed navbar height (App/ServicesPage wrap content in pt-20) plus breathing room.
const NAVBAR_OFFSET = 96

// React Router's client-side navigation doesn't auto-scroll to #hash targets
// the way a full page load does — this fills that gap for both in-page and
// cross-page anchor links (e.g. a Navbar link from /services back to /#about).
export default function useScrollToHash() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (!hash) return
    const target = document.getElementById(hash.slice(1))
    if (!target) return
    const top = target.getBoundingClientRect().top + window.scrollY - NAVBAR_OFFSET
    window.scrollTo({ top, behavior: 'smooth' })
  }, [pathname, hash])
}
