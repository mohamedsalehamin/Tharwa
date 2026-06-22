import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { SiteLayout } from '@/components/SiteLayout'
import { DownloadRedirectPage } from '@/pages/DownloadRedirectPage'
import { DynamicPage } from '@/pages/DynamicPage'
import { LandingPage } from '@/pages/LandingPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/download/android' element={<DownloadRedirectPage platform='android' />} />
        <Route path='/download/ios' element={<DownloadRedirectPage platform='ios' />} />
        <Route element={<SiteLayout />}>
          <Route path='/' element={<LandingPage />} />
          <Route path='/:slug' element={<DynamicPage />} />
          <Route path='*' element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
