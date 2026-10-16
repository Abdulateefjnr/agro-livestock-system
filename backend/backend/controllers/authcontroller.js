const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const nodemailer = require('nodemailer')
const path = require('path')
const User = require('../models/user')
const logActivity = require('../utils/audit')
const createFrontendUrl = require('../utils/frontendUrl')

const isConfiguredAdmin = (email) =>
  Boolean(process.env.ADMIN_EMAIL) &&
  email.trim().toLowerCase() === process.env.ADMIN_EMAIL.trim().toLowerCase()

const getPublicUser = (user) => ({
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone ?? '',
  role: user.role,
  isActive: user.isActive !== false,
  status: user.status ?? (user.isActive === false ? 'inactive' : 'active'),
  profilePicture: user.profilePicture ?? '',
  assignedFarmIds: (user.assignedFarmIds ?? []).map(String),
  lastLoginAt: user.lastLoginAt
})


const sendPasswordResetEmail = async (email, resetUrl) => {
  const requiredSettings = [
    'EMAIL_HOST',
    'EMAIL_PORT',
    'EMAIL_USER',
    'EMAIL_PASS',
    'FRONTEND_URL',
  ];

  const missingSettings = requiredSettings.filter(
    (setting) => !process.env[setting]
  );

  if (missingSettings.length) {
    throw new Error(
      `Missing email configuration: ${missingSettings.join(', ')}`
    );
  }

  const port = Number(process.env.EMAIL_PORT);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('EMAIL_PORT must be a valid port number');
  }

  const secureSetting = process.env.EMAIL_SECURE?.toLowerCase();

  if (
    secureSetting &&
    secureSetting !== 'true' &&
    secureSetting !== 'false'
  ) {
    throw new Error('EMAIL_SECURE must be true or false');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port,
    secure: secureSetting
      ? secureSetting === 'true'
      : port === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.verify();

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: email,
    subject: 'Reset your Agro Livestock password',
    text: `Reset your password using this link. It expires in one hour: ${resetUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: auto;">
        <h2>Reset your password</h2>
        <p>We received a request to reset your Agro Livestock password.</p>
        <p>
          <a href="${resetUrl}"
             style="background:#2E7D32;color:white;padding:12px 20px;text-decoration:none;border-radius:6px;">
            Reset Password
          </a>
        </p>
        <p>This link expires in one hour.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
};



// SIGN UP


const signup = async (req, res) => {
  let stage = 'validating signup fields'

  try {
    const body = req.body ?? {}
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!fullName || !email || !password) {
      return res.status(400).json({
        message: 'Please fill in all fields'
      })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address' })
    }

    // Check existing user
    stage = 'checking for an existing user'
    const normalizedEmail = email
    const existingUser = await User.findOne({ email: normalizedEmail })

    if (existingUser) {
      return res.status(400).json({
        message: 'User already exists'
      })
    }

    // Hash password
    stage = 'hashing the password'
    const hashedPassword = await bcrypt.hash(
      password,
      10
    )

    // Create user
    stage = 'creating the user'
    const lastLoginAt = new Date()
    const user = await User.create({
      fullName,
      email: normalizedEmail,
      password: hashedPassword,
      role: isConfiguredAdmin(normalizedEmail) ? 'admin' : 'staff',
      farmAssignmentsConfigured: true,
      status: 'active',
      isActive: true,
      lastLoginAt
    })

    // Create JWT
    stage = 'signing the signup token'
    const token = jwt.sign(
      {
        userId: user._id,
        sessionVersion: user.sessionVersion ?? 0
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d'
      }
    )

    res.status(201).json({
      message: 'Account created successfully',

      token,

      user: getPublicUser(user)
    })

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An account with this email already exists' })
    }
    console.error(`Signup failed while ${stage}:`, error)

    res.status(500).json({
      message: 'Server error'
    })
  }
}



// LOGIN


const login = async (req, res) => {
  let stage = 'validating login fields'

  try {
    const body = req.body ?? {}
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    // Check fields
    if (!email || !password) {
      return res.status(400).json({
        message: 'Please enter email and password'
      })
    }

    // Find user
    stage = 'looking up the user'
    const user = await User.findOne({ email })

    if (!user) {
      return res.status(401).json({
        message: 'Invalid email or password'
      })
    }

    // Compare password
    stage = 'verifying the password'
    const passwordMatch =
      await bcrypt.compare(
        password,
        user.password
      )

    if (!passwordMatch) {
      return res.status(401).json({
        message: 'Invalid email or password'
      })
    }

    if (
      user.isActive === false ||
      ['pending', 'inactive', 'suspended'].includes(user.status)
    ) {
      return res.status(403).json({ message: 'This account is not active. Contact an administrator.' })
    }

    if (isConfiguredAdmin(email)) user.role = 'admin'

    stage = 'recording the login time'
    user.lastLoginAt = new Date()
    await user.save()

    // Create JWT
    stage = 'signing the login token'
    const token = jwt.sign(
      {
        userId: user._id,
        sessionVersion: user.sessionVersion ?? 0
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d'
      }
    )

    await logActivity({
      actorId: user._id,
      targetUserId: user._id,
      action: 'signed_in',
      entityType: 'session',
      entityId: user._id
    })

    res.json({
      message: 'Login successful',

      token,

      user: getPublicUser(user)
    })

  } catch (error) {
    console.error(`Login failed while ${stage}:`, error)

    res.status(500).json({
      message: 'Server error'
    })
  }
}

const forgotPassword = async (req, res) => {
  let stage = 'validating the email address'

  try {
    const email = typeof req.body.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : ''

    if (!email) {
      return res.status(400).json({ message: 'Please enter your email address' })
    }

    stage = 'looking up the account'
    const user = await User.findOne({ email })

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex')
      const resetTokenHash = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex')

      user.passwordResetToken = resetTokenHash
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000)

      stage = 'saving the password reset token'
      await user.save()

      try {
        if (!process.env.FRONTEND_URL) {
          throw new Error('Missing email configuration: FRONTEND_URL')
        }

        const resetUrl = createFrontendUrl('reset-password')
        resetUrl.searchParams.set('token', resetToken)

        stage = 'sending the password reset email'
        await sendPasswordResetEmail(user.email, resetUrl.toString())
      } catch (error) {
        user.passwordResetToken = undefined
        user.passwordResetExpires = undefined
        await user.save()
        throw error
      }
    }

    return res.json({
      message: 'If an account exists for that email, a password reset link has been sent.'
    })
  } catch (error) {
    console.error(`Password reset request failed while ${stage}:`, error)
    return res.status(500).json({
      message: 'Unable to send a password reset email right now. Please try again later.'
    })
  }
}

const resetPassword = async (req, res) => {
  let stage = 'validating the reset request'

  try {
    const { token, password } = req.body

    if (typeof token !== 'string' || !token || typeof password !== 'string' || !password) {
      return res.status(400).json({ message: 'A reset token and new password are required' })
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' })
    }

    const resetTokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex')

    stage = 'validating the reset token'
    const user = await User.findOne({
      passwordResetToken: resetTokenHash,
      passwordResetExpires: { $gt: new Date() }
    }).select('+passwordResetToken +passwordResetExpires')

    if (!user) {
      return res.status(400).json({
        message: 'This password reset link is invalid or has expired'
      })
    }

    stage = 'hashing the new password'
    user.password = await bcrypt.hash(password, 10)
    if (user.status === 'pending') {
      user.status = 'active'
      user.isActive = true
    }
    user.sessionVersion = (user.sessionVersion ?? 0) + 1
    user.passwordResetToken = undefined
    user.passwordResetExpires = undefined

    stage = 'saving the new password'
    await user.save()
    await logActivity({
      actorId: user._id,
      targetUserId: user._id,
      action: 'password_reset',
      entityType: 'user',
      entityId: user._id
    })

    return res.json({ message: 'Password reset successfully. You can now log in.' })
  } catch (error) {
    console.error(`Password reset failed while ${stage}:`, error)
    return res.status(500).json({ message: 'Unable to reset your password right now' })
  }
}

module.exports = {
  signup,
  login,
  forgotPassword,
  resetPassword
}