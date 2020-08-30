const mongoose = require('mongoose')
const Store = mongoose.model('Store')
const User = mongoose.model('User')
const multer = require('multer')
const jimp = require('jimp')
const uuid = require('uuid')

const multerOptions = {
  storage: multer.memoryStorage(),
  fileFilter (req, file, next) {
    const isPhoto = file.mimetype.startsWith('image/')
    if (isPhoto) {
      next(null, true)
    } else {
      next({ message: 'That file type isn\'t allowed' }, false)
    }
  }
}

exports.homePage = (req, res) => {
  res.render('index')
}

exports.addStore = (req, res) => {
  res.render('editStore', {
    title: 'Add Store'
  })
}

exports.upload = multer(multerOptions).single('photo')
exports.resize = async (req, res, next) => {
  if (!req.file) {
    return next()
  }
  const extension = req.file.mimetype.split('/')[1]
  req.body.photo = `${uuid.v4()}.${extension}`
  // now we resize
  const photo = await jimp.read(req.file.buffer)
  await photo.resize(800, jimp.AUTO)
  // write the photo to file system storage disk
  await photo.write(`./public/uploads/${req.body.photo}`)
  // keep going to create store and save its info including photo
  next()
}

exports.createStore = async (req, res) => {
  req.body.author = req.user._id
  const store = await (new Store(req.body)).save()
  req.flash('success', `Successfully created ${store.name}. Care to leave a review?!`)
  res.redirect(`/store/${store.slug}`)
}

exports.getStores = async (req, res) => {
  const page = req.params.page || 1
  const limit = 4
  const skip = (page * limit) - limit
  // 1. query the DB for a list of all stores
  const storesPromise = Store
    .find()
    .skip(skip)
    .limit(limit)
    .sort({ created: 'desc' })
  const countPromise = Store.count()
  const [stores, count] = await Promise.all([storesPromise, countPromise])
  const pages = Math.ceil(count / limit)
  if (!stores.length && skip) {
    req.flash('info', `Hey, You asked for page ${page}. But that doesn't exist so I put you on page ${pages}`)
    res.redirect(`/stores/page/${pages}`)
    return
  }
  res.render('stores', { title: 'Stores', stores, page, pages, count })
}

const confirmOwner = (store, user) => {
  if (!store.author.equals(user._id)) {
    throw Error('You must be the owner of the store to be able to edit it!')
  }
}

exports.editStore = async (req, res) => {
  // 1. find the store given the ID
  const store = await Store.findOne({ _id: req.params.id })
  // 2. Confirm they are the owner of the store
  confirmOwner(store, req.user)
  // 3. render out the form so store can be edited
  res.render('editStore', { title: `Edit ${store.name}`, store })
}

exports.updateStore = async (req, res) => {
  // set the location data to be a point by default
  req.body.location.type = 'Point'
  // find and update the store
  const store = await Store.findOneAndUpdate({ _id: req.params.id }, req.body, {
    new: true, // return the new updated instead of the old one (default)
    runValidators: true // run form validators again on the DB level to ensure name isn't empty for example
  }).exec()
  // let them know it worked
  req.flash('success', `Successfully updated <strong>${store.name}</strong>. <a href="/stores/${store.slug}">view store ➡️</a>`)
  // redirect to the store
  res.redirect(`/stores/${store._id}/edit`)
}

exports.getStoreBySlug = async (req, res, next) => {
  const store = await Store.findOne({ slug: req.params.slug }).populate('author reviews')
  if (!store) return next()
  res.render('store', { title: store.name, store })
}

exports.getStoresByTag = async (req, res) => {
  const tag = req.params.tag
  const tagQuery = tag || { $exists: true }
  const tagsPromise = Store.getTagsList()
  const storesPromise = Store.find({ tags: tagQuery })
  const [tags, stores] = await Promise.all([tagsPromise, storesPromise])
  res.render('tags', { tags, title: 'Tags', tag, stores })
}

exports.searchStores = async (req, res) => {
  const stores = await Store
    .find({
      $text: {
        $search: req.query.q
      }
    }, {
      score: { $meta: 'textScore' }
    })
    .sort({
      score: { $meta: 'textScore' }
    })
    .limit(5)
  res.json(stores)
}

exports.mapStores = async (req, res) => {
  const coordinates = [req.query.lng, req.query.lat].map(parseFloat)
  const q = {
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates
        },
        $maxDistance: 10000 // 10km
      }
    }
  }

  const stores = await Store.find(q).select('slug name description location photo').limit(10)
  res.json(stores)
}

exports.mapPage = (req, res) => {
  res.render('map', { title: 'Map' })
}

exports.heartStore = async (req, res) => {
  const hearts = req.user.hearts.map(obj => obj.toString())
  // $pull is a mongo operator to remove from array
  // addToSet is a mongo operator to add a unique attribute value to array
  const operator = hearts.includes(req.params.id) ? '$pull' : '$addToSet'
  const user = await User.findByIdAndUpdate(req.user._id,
    { [operator]: { hearts: req.params.id } },
    { new: true }
  )
  res.json(user)
}

exports.getHearts = async (req, res) => {
  const stores = await Store.find({
    _id: { $in: req.user.hearts }
  })
  res.render('stores', { title: 'Hearted Stores', stores })
}

exports.getTopStores = async (req, res) => {
  const stores = await Store.getTopStores()
  res.render('topStores', { stores, title: '⭐ Top Stores' })
}
