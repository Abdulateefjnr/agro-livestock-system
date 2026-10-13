
import { Navigate } from 'react-router-dom'
import type { UserRole } from '../lib/records'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: UserRole
}

function ProtectedRoute({
  children,
  requiredRole
}: ProtectedRouteProps) {

  const token = sessionStorage.getItem('token')
  const userRole = sessionStorage.getItem('userRole')

  if (!token) {
    return <Navigate to="/" replace />
  }

  if (requiredRole && userRole !== requiredRole) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

export default ProtectedRoute
