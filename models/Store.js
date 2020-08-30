const mongoose = require('mongoose')
mongoose.Promise = global.Promise
const slug = require('slugs')

const storeSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    required: 'Please enter a store name!'
  },
  slug: String,
  description: {
    type: String,
    trim: true
  },
  tags: [String],
  created: {
    type: Date,
    default: Date.now()
  },
  location: {
    type: {
      type: String,
      default: 'Point'
    },
    coordinates: [{
      type: Number,
      required: 'You must supply coordinates'
    }],
    address: {
      type: String,
      required: 'You must supply an address'
    }
  },
  photo: String,
  author: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: 'You must supply an author'
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// define indexes
storeSchema.index({
  name: 'text',
  description: 'text'
})

storeSchema.index({ location: '2dsphere' })

// We need a pre save hook to generate the slug from the store name in the request before saving the model to the DB
storeSchema.pre('save', async function (next) {
  if (!this.isModified('name')) { // only run the function if name is being modified and not every time (perf)
    next()
    return
  }
  this.slug = slug(this.name)
  // find other stores that have a slug of omar, omar-1, omar-2 ...etc
  const slugRegex = new RegExp(`^(${this.slug})((-[0-9]*$)?)$`, 'i')
  const storesWithSlug = await this.constructor.find({ slug: slugRegex }) // this.constructor is the way we access the model inside the model function
  if (storesWithSlug.length) {
    this.slug = `${this.slug}-${storesWithSlug.length + 1}`
  }

  next()
  // TODO: Make more resilient so slugs are unique
})

storeSchema.pre('save', async function (next) {
  if (!this.isModified('name')) { // only run the function if name is being modified and not every time (perf matters)
    next()
    return
  }
  this.slug = slug(this.name)
  // find other stores that have a slug of omar, omar-1, omar-2 ...etc
  const slugRegex = new RegExp(`^(${this.slug})((-[0-9]*$)?)$`, 'i')
  const storesWithSlug = await this.constructor.find({ slug: slugRegex }) // this.constructor is the way we access the model inside the model function
  if (storesWithSlug.length) {
    this.slug = `${this.slug}-${storesWithSlug.length + 1}`
  }
  next()
})

storeSchema.statics.getTagsList = function () {
  return this.aggregate([
    // mongo DB aggregate pipeline operators
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ])
}

storeSchema.statics.getTopStores = function () {
  return this.aggregate([
    // lookup stores and populate their reviews
    { $lookup: { from: 'reviews', localField: '_id', foreignField: 'store', as: 'reviews' } },
    // filter for items that have 2 or more reviews
    { $match: { 'reviews.1': { $exists: true } } },
    // add the average reviews field
    { $addFields: { averageRating: { $avg: '$reviews.rating' } } },
    // sort it by our new field, highest reviews first
    { $sort: { averageRating: -1 } },
    // limit to at most 10
    { $limit: 10 }
  ])
}

// find reviews where the store _id property === reviews store property
storeSchema.virtual('reviews', {
  ref: 'Review', // what model to link
  localField: '_id', // which field on the store
  foreignField: 'store' // which field on the review
})

function autopopulate (next) {
  this.populate('reviews')
  next()
}

storeSchema.pre('find', autopopulate)
storeSchema.pre('findOne', autopopulate)

module.exports = mongoose.model('Store', storeSchema)
