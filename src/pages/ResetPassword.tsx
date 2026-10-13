import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import logo from '../assets/logo.png'
import { API_BASE_URL } from '../lib/api'

function ResetPassword() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resetComplete, setResetComplete] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErrorMessage('')

    if (!token) {
      setErrorMessage('This password reset link is invalid or has expired.')
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('The passwords do not match.')
      return
    }

    setIsSubmitting(true)

    try {
      await axios.post(
        `${API_BASE_URL}/auth/reset-password`,
        { token, password }
      )

      const updatedParams = new URLSearchParams(searchParams)
      updatedParams.delete('token')
      setSearchParams(updatedParams, { replace: true })
      setResetComplete(true)
    } catch (error: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined

      setErrorMessage(message || 'Unable to reset your password right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="login">
      <div className="row">
        <div className="login-col" />
        <div className="login-col">
          <form onSubmit={handleSubmit} className="login-form">
            <img className="login-log-icon" src={logo} alt="Agro Livestock" />
            <h1>{resetComplete ? 'password updated' : 'choose a new password'}</h1>
            {!resetComplete && (
              <span>
                {token
                  ? 'Your reset link is valid for one hour and can only be used once.'
                  : 'Open the reset link from your email to choose a new password.'}
              </span>
            )}
            {resetComplete ? (
              <>
                <span role="status">Your password has been reset. You can now log in with your new password.</span>
                <span className="span-2"><Link to="/">Back to login</Link></span>
              </>
            ) : (
              <>
                <div className="login-input">
                  <label htmlFor="new-password">new password</label>
                  <div className="login-input-wrapper">
                    <input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={!token || isSubmitting}
                    />
                  </div>
                </div>
                <div className="login-input">
                  <label htmlFor="confirm-password">confirm new password</label>
                  <div className="login-input-wrapper">
                    <input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={!token || isSubmitting}
                    />
                  </div>
                </div>
                {errorMessage && <span role="alert">{errorMessage}</span>}
                {!token && <span role="alert">This password reset link is invalid or has expired.</span>}
                {token && (
                  <button type="submit" className="login-button" disabled={isSubmitting}>
                    {isSubmitting ? 'Updating password...' : 'Update password'}
                  </button>
                )}
                <span className="span-2"><Link to="/">Back to login</Link></span>
              </>
            )}
          </form>
        </div>
      </div>
    </section>
  )
}

export default ResetPassword
