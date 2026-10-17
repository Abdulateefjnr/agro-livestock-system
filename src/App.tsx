import { BrowserRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import FarmPage from './pages/farm'
import Records from './pages/Records'
import CropFields from './pages/Crop Fields'
import Expenses from './pages/Expenses'
import Livestock from './pages/Livestock'
import ResetPassword from './pages/ResetPassword'
import Sales from './pages/Sales'
import Reports from './pages/reports'
import UsersPage from './pages/user'
import SettingsPage from './pages/settings'
import ProtectedRoute from './components/ProtectedRoute'
import { useState } from 'react'
import axios from 'axios'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleExclamation,
  faEnvelope,
  faEye,
  faEyeSlash,
  faLock,
  faUser,
} from '@fortawesome/free-solid-svg-icons'
import img from './assets/Login-hero.png'
import logo from './assets/logo.png'
import { API_BASE_URL } from './lib/api'
import './App.css'
import './index.css'

function Login() {
  const navigate = useNavigate()
  const [isSignUp, setIsSignUp] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showSignupPassword, setShowSignupPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // signup 
  const [fullName, setFullName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupError, setSignupError] = useState('')
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [resetRequestSent, setResetRequestSent] = useState(false)
  const [resetRequestError, setResetRequestError] = useState('')
  const [isRequestingReset, setIsRequestingReset] = useState(false)

  const handleLogin = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault()

    try {
      const response = await axios.post(
        `${API_BASE_URL}/auth/login`,
        {
          email,
          password
        }
      )

      sessionStorage.setItem('token', response.data.token)
      sessionStorage.setItem('user', JSON.stringify(response.data.user))
      sessionStorage.setItem('userName', response.data.user.fullName)
      sessionStorage.setItem('lastLoginAt', response.data.user.lastLoginAt)
      sessionStorage.setItem('userRole', response.data.user.role ?? 'staff')
      navigate('/dashboard')
    } catch (error: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined

      alert(message || 'Login failed')
    }
  }

  const handleSignUp = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault()
    setSignupError('')

    try {
      const response = await axios.post(
        `${API_BASE_URL}/auth/signup`,
        {
          fullName,
          email: signupEmail,
          password: signupPassword
        }
      )

      sessionStorage.setItem('token', response.data.token)
      sessionStorage.setItem('user', JSON.stringify(response.data.user))
      sessionStorage.setItem('userName', response.data.user.fullName)
      sessionStorage.setItem('lastLoginAt', response.data.user.lastLoginAt)
      sessionStorage.setItem('userRole', response.data.user.role ?? 'staff')
      navigate('/dashboard', { state: { welcomeType: 'signup' } })
    } catch (error: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined

      setSignupError(message || 'Sign up failed. Please try again.')
    }
  }

  const handleForgotPassword = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault()
    setResetRequestSent(false)
    setResetRequestError('')
    setIsRequestingReset(true)

    try {
      await axios.post(`${API_BASE_URL}/auth/forgot-password`, { email })
      setResetRequestSent(true)
    } catch (error: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined

      setResetRequestError(message || 'Unable to request a password reset right now')
    } finally {
      setIsRequestingReset(false)
    }
  }

  return (
    <section>
      <div className="login">
        <div className="row">
          <div className="login-col">
            <div className="login-hero">
              <div className="login-hero-small">
                <img src={logo} alt="" />
              </div>
              <img src={img} className='login-img' alt="" />
            </div>
          </div>
          <div className="login-col">
            {isForgotPassword ? (
              <form onSubmit={handleForgotPassword} className='login-form'>
                <img className='login-log-icon' src={logo} alt="" />
                <h1>reset your password</h1>
                <span>Enter your account email and we’ll send a reset link if an account matches.</span>
                <div className="login-input">
                  <label htmlFor="reset-email">email</label>
                  <div className='login-input-wrapper'>
                    <FontAwesomeIcon icon={faEnvelope} aria-hidden="true" />
                    <input
                      id="reset-email"
                      type="email"
                      autoComplete="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />

                  </div>
                </div>
                {resetRequestSent && (
                  <span role="status">If an account exists for that email, a password reset link has been sent.</span>
                )}
                {resetRequestError && (
                  <span role="alert">{resetRequestError}</span>
                )}
                <button type="submit" className='login-button' disabled={isRequestingReset}>
                  {isRequestingReset ? 'Sending reset link...' : 'Send reset link'}
                </button>
                <span className='span-2'>
                  <a href="#" onClick={(e) => {
                    e.preventDefault()
                    setIsForgotPassword(false)
                    setResetRequestSent(false)
                    setResetRequestError('')
                  }}>Back to login</a>
                </span>
              </form>
            ) : isSignUp ?(
              <form onSubmit={handleSignUp} className='login-form'>
              <img className='login-log-icon' src={logo} alt="" />
              <h1>welcome to new account!</h1>
              {signupError && (
                <div className="form-feedback form-feedback-error" role="alert">
                  <FontAwesomeIcon icon={faCircleExclamation} aria-hidden="true" />
                  <span>{signupError}</span>
                </div>
              )}
              <span>
                  Already have an account?{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      setSignupError('')
                      setIsSignUp(false)
                    }}
                  >
                    Login
                  </a>
                </span>
              <div className="login-input">
                <label htmlFor="full name">full name</label>
                <div className="login-input-wrapper">
                  <FontAwesomeIcon icon={faUser} aria-hidden="true" />
                  <input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} type="text" placeholder='Enter your name' required />
                </div>
              </div>
              <div className="login-input">
                <label htmlFor="email">email</label>
                <div className='login-input-wrapper'>
                  <FontAwesomeIcon icon={faEnvelope} aria-hidden="true" />
                  <input id="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} type="email" placeholder='Enter your email' required />
                </div>
              </div>
              <div className="login-input">
                <label htmlFor="password">password</label>
                <div className="login-input-wrapper">
                  <FontAwesomeIcon icon={faLock} aria-hidden="true" />
                    <input
                      id="signup-password"
                      minLength={8}
                      autoComplete="new-password"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      type={showSignupPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowSignupPassword(!showSignupPassword)}
                      aria-label={showSignupPassword ? "Hide password" : "showSignupPassword"}
                    >
                      <FontAwesomeIcon
                        icon={showSignupPassword ? faEyeSlash : faEye}
                        aria-hidden="true"
                      />
                    </button>
                </div>
              </div>
              <button type="submit" className='login-button'>Sign up</button>
            </form>
            ):(
              <form onSubmit={handleLogin} className='login-form'>
              <img className='login-log-icon' src={logo} alt="" />
              <h1>welcome back!</h1>
              <span>
                  Don't have an account?{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      setSignupError('')
                      setIsSignUp(true)
                    }}
                  >
                    Sign up
                  </a>
                </span>
              <div className="login-input">
                <label htmlFor="email">email</label>
                <div className='login-input-wrapper'>
                  <FontAwesomeIcon icon={faEnvelope} aria-hidden="true" />
                  <input
                    id='email'
                    placeholder='Enter your email'
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="login-input">
                <label htmlFor="password">password</label>
                <div className="login-input-wrapper">
                  <FontAwesomeIcon icon={faLock} aria-hidden="true" />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      <FontAwesomeIcon
                        icon={showPassword ? faEyeSlash : faEye}
                        aria-hidden="true"
                      />
                    </button>
                </div>
              </div>
              <button type='submit' className='login-button'>Log in</button>
              <span className='span-2'>Forgot password? <a href="#" onClick={(e) => {
                e.preventDefault()
                setIsForgotPassword(true)
                setResetRequestSent(false)
                setResetRequestError('')
              }}>Reset</a></span>
            </form>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}







function App() {

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>

      <Routes>

        {/* Login / Sign Up */}
        <Route
          path="/"
          element={<Login />}
        />

        <Route
          path="/reset-password"
          element={<ResetPassword />}
        />

        {/* Protected Dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/farms"
          element={
            <ProtectedRoute>
              <FarmPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          }
        />

        <Route
          path="/users"
          element={
            <ProtectedRoute requiredRole="admin">
              <UsersPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/records/:type"
          element={
            <ProtectedRoute>
              <RecordsRoute />
            </ProtectedRoute>
          }
        />

      </Routes>

    </BrowserRouter>
  )
}

function RecordsRoute() {
  const { type } = useParams()
  switch (type) {
    case 'livestock':
      return <Livestock key={type} />
    case 'crops':
      return <CropFields key={type} />
    case 'sales':
      return <Sales key={type} />
    case 'expenses':
      return <Expenses key={type} />
    case 'inventory':
      return <Records key={type} />
    default:
      return <Records key={type} />
  }
}

export default App
