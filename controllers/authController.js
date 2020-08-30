const passport = require('passport')
const crypto = require('crypto')
const mongoose = require('mongoose')
const User = mongoose.model('User')
const promisify = require('es6-promisify')
const mail = require('../handlers/mail.js')

exports.login = passport.authenticate('local', {
  failureRedirect: '/login',
  failureFlash: 'Failed login',
  successRedirect: '/',
  successFlash: 'You are now logged in'
})

exports.logout = (req, res) => {
  req.logout()
  req.flash('success', 'You have been logged out successfully 🙋🏼‍♂️')
  res.redirect('/')
}

exports.isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next()
  }
  req.flash('error', 'Oops, You must be logged in to view this page!')
  res.redirect('/login')
}

exports.forgot = async (req, res) => {
  // 1. check if user exists
  const user = await User.findOne({ email: req.body.email })
  if (!user) {
    req.flash('error', 'No account with that email exists')
    return res.redirect('/login')
  }
  // 2. if so, set reset token and expiry on their account
  user.resetPasswordToken = crypto.randomBytes(20).toString('hex')
  user.resetPasswordExpires = Date.now() + 3600000 // an hour from now
  await user.save()
  // 3. send an email to address with the reset token
  const resetURL = `http://${req.headers.host}/account/reset/${user.resetPasswordToken}`
  await mail.send({
    user,
    subject: 'Password Reset',
    resetURL,
    filename: 'password-reset'
  })
  req.flash('success', 'A password reset link has been email to you.')
  // 4. redirect to login page after email sent
  res.redirect('/login')
}

exports.reset = async (req, res) => {
  const user = await User.findOne({
    resetPasswordToken: req.params.token,
    resetPasswordExpires: { $gt: Date.now() }
  })
  if (!user) {
    req.flash('error', 'Reset password token is invalid or has expired')
    return res.redirect('/login')
  }
  // if there is a user show the reset password form
  res.render('reset', { title: 'Reset your password' })
}

exports.confirmedPasswords = (req, res, next) => {
  if (req.body.password === req.body['password-confirm']) {
    return next() // keep going
  }
  req.flash('error', 'Passwords do not match!')
  res.redirect('back')
}

exports.update = async (req, res) => {
  const user = await User.findOne({
    resetPasswordToken: req.params.token,
    resetPasswordExpires: { $gt: Date.now() }
  })

  if (!user) {
    req.flash('error', 'Reset password token is invalid or has expired')
    return res.redirect('/login')
  }

  const setPassword = promisify(user.setPassword, user)
  await setPassword(req.body.password)
  user.resetPasswordToken = undefined
  user.resetPasswordExpires = undefined
  const updatedUser = await user.save()
  await req.login(updatedUser)
  req.flash('success', '💃🏼Your password has been reset. You are now logged in!')
  res.redirect('/')
}
