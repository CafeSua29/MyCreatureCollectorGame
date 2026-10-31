import './styles/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'

const root = document.getElementById('root')
// index.html luôn có #root; thiếu thì là lỗi đóng gói, báo rõ thay vì màn trắng khó hiểu.
if (!root) throw new Error('Không tìm thấy phần tử #root trong index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
