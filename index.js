'use strict'

const pump = require('pump')
const through = require('through2')

module.exports = profferStreamToRealtimeTree

function profferStreamToRealtimeTree (stream, { trees = {}, mapFrames = (f) => f } = {}) {
  const merged = trees.merged || {
    name: 'all stacks',
    value: 0,
    top: 0,
    children: [{}]
  }
  const unmerged = trees.unmerged || {
    name: 'all stacks',
    value: 0,
    top: 0,
    children: [{}]
  }

  const treeify = through.obj(({stack}, _, cb) => {
    processStack(stack)
    if (stack && stack.length) {
      promise.fresh = true
    }
    cb()
  })

  const promise = new Promise((resolve, reject) => {
    pump(stream, treeify, (err) => {
      if (err) return void reject(err)
      resolve({merged, unmerged})
    })
  })
  
  promise.fresh = true
  promise.merged = merged
  promise.unmerged = unmerged

  return promise

  function processStack (stack) {
    stack = mapFrames(stack)
    if (!stack) return
    stack = stack.map(({name, cs, type}, ix) => {
      name = name.replace(/ (:[0-9]+:[0-9]+)/, (_, loc) => ` [eval]${loc}`)
      // 0 compiled
      // 1 unoptimized
      // 2 optimized
      // 3 inlinable unoptimized
      // 4 inlinable optimized
      var S = 0

      if (type === 'JS') {
        if (name[0] === ' ') name = '(anonymous)' + name
        if (cs === '~') S += 1
        if (cs === '*') S += 2
      }

      if (type && type !== 'JS') name += ' [' + type + ']'
      return {S, name, value: 0, top: 0} 
    })
    stack = labelInitFrames(stack)
    addToMergedTree(stack.map(({S, name, value, top}) => ({S, name, value, top})))
    // mutate original (save another loop over stack + extra objects)
    addToUnmergedTree(stack)
    return stack
  }

  function addToMergedTree (stack) {
    var lastFrame = null
    stack.forEach((frame, ix) => {
      if (frame.S > 2) return // skip inlined
      if (ix > 0) lastFrame.children = lastFrame.children || []
      const children = (ix === 0) ? merged.children : lastFrame.children
      const child = children.find(({name}) => name === frame.name)

      if (child === undefined) children.push(frame)
      else frame = child

      if (ix === stack.length - 1) frame.top++
      if (ix === 0) merged.value += 1
      frame.value++

      lastFrame = frame
    })
  }

  function addToUnmergedTree (stack) {
    var lastFrame = null
    stack.forEach((frame, ix) => {
      if (ix > 0) lastFrame.children = lastFrame.children || []
      const children = (ix === 0) ? unmerged.children : lastFrame.children
      const child = children.find(({fn, S}) => {
        return fn === frame.name && S === frame.S
      })

      if (child === undefined) {
        frame.fn = frame.name
        if (frame.S === 1) frame.name = '~' + frame.name
        if (frame.S === 2) frame.name = '*' + frame.name
        if (frame.S === 3) frame.name = '~' + frame.name + ' [INLINABLE]'
        if (frame.S === 4) frame.name = '*' + frame.name + ' [INLINABLE]'
        children.push(frame)
      } else frame = child

      if (ix === stack.length - 1) frame.top++
      if (ix === 0) unmerged.value += 1
      frame.value++

      lastFrame = frame
    })
  }

  function labelInitFrames (frames) {
    const startupBootstrapNodeIndex = frames.findIndex(({name}, ix) => {
      if (frames[ix + 1] && /Module.runMain module\.js/.test(frames[ix + 1].name)) return false
      return /startup bootstrap_node\.js/.test(name) 
    })

    if (startupBootstrapNodeIndex !== -1) {
      frames.slice(startupBootstrapNodeIndex + 1).forEach((frame) => {
        if (frame.isInit) return
        frame.name += ' [INIT]'
        frame.isInit = true
      })
    }

    const moduleRunMainIndex = frames.findIndex(({name}, ix) => {
      return /Module.runMain module\.js/.test(name) 
    })

    if (moduleRunMainIndex !== -1) {
      frames.slice(moduleRunMainIndex + 1).forEach((frame) => {
        if (frame.isInit) return
        if (/.+ (internal\/)?module\.js/.test(frame.name)) frame.name += ' [INIT]'
        frame.isInit = true
      })
    }

    // if there's so many modules to load, the module requiring may 
    // actually go into another tick, so far that's been observed where Module.load
    // is the first function, but there could be variation...

    const partOfModuleLoadingCycle = frames.findIndex(({name}, ix) => {
      return /(Module\.load|Module\._load|tryModuleLoad|Module\._extensions.+|Module\._compile|Module.require|require internal.+) module\.js/.test(name) 
    })

    if (partOfModuleLoadingCycle === 0) {
      frames.forEach((frame) => {
        if (frame.isInit) return
        if (/.+ (internal\/)?module\.js/.test(frame.name)) frame.name += ' [INIT]'
        frame.isInit = true
      })
    }

    return frames
  }
}