const slim = require('observable-slim')
const EventEmitter = require('events')
const get = require('lodash.get')
const isEqual = require('lodash.isequal')
const register = require('./lib/register')

module.exports = ({ initialState = {}, actions = {}, mutations = {} } = {}, { deep } = { deep: false }) => {
  const bus = new EventEmitter()
  bus.setMaxListeners(0)

  const state = slim.create(initialState, false, (changes) => {
    changes.forEach(change => {
      if (change.type == 'update' &&
      change.property == 'length' &&
      Array.isArray(change.target) &&
      change.target.length == change.newValue) {
        return
      }

      bus.emit('root', state, change)
    })
  })

  function observeLater (mapper, handler) {
    let off

    function observer (value, change) {
      let val
      try {
        val = mapper(state)
      } catch (e) {
        // a previously known and watched value (and its parent) is probably deleted
        // so call the handler with value undefined and update lastValue to undefined.
        if (typeof mapper.lastValue != 'undefined') handler(undefined, change)
        mapper.lastValue = undefined
        return
      }

      if (typeof val != 'undefined') {
        const path = (val && val.__getPath) || mapper.path

        if (!isEqual(mapper.lastValue, val) || (change.currentPath.startsWith(path) && path.length <= change.currentPath.length)) {
          mapper.lastValue = val
          handler(val, change)
        }
      } else if (typeof mapper.lastValue != 'undefined' && typeof val == 'undefined') {
        handler(undefined, change)
        mapper.lastValue = undefined
      }
    }

    bus.on('root', observer)
    off = () => bus.removeListener('root', observer)
    return () => off()
  }

  function observe (mapper, handler) {
    let mapperFn = mapper
    if (typeof mapper != 'function' && typeof mapper != 'string') mapperFn = () => mapper

    if (typeof mapper == 'string') {
      mapperFn = () => get(state, mapper)
      mapperFn.path = mapper
    }

    let val

    try {
      val = mapperFn()
    } catch (e) {
      return observeLater(mapperFn, handler)
    }

    mapperFn.lastValue = val

    return observeLater(mapperFn, handler)
  }

  const boundRegister = register(observe, state)
  const boundActions = {}
  const boundMutations = {}

  const store = {
    state,
    observe,
    actions: boundActions,
    mutations: boundMutations
  }

  Object.keys(actions).forEach(key => {
    boundActions[key] = actions[key].bind(store, { actions: boundActions, mutations: boundMutations, state })
  })

  Object.keys(mutations).forEach(key => {
    boundMutations[key] = mutations[key].bind(store, { mutations: boundMutations, state })
  })

  return {
    ...store,
    $$register: boundRegister
  }
}
