import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { SiteLayout } from '@/components/SiteLayout'
import { DynamicPage } from '@/pages/DynamicPage'
import { LandingPage } from '@/pages/LandingPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

export function App() {
  return (
    <BrowserRouter>
      <SiteLayout>
        <Routes>
          <Route path='/' element={<LandingPage />} />
          <Route path='/:slug' element={<DynamicPage />} />
          <Route path='*' element={<NotFoundPage />} />
        </Routes>
      </SiteLayout>
    </BrowserRouter>
  )
}
