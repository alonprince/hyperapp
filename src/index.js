export function h(name, attributes) {
  var rest = []
  var children = []
  var length = arguments.length

  // 把children放入rest
  while (length-- > 2) rest.push(arguments[length])

  while (rest.length) {
    var node = rest.pop()
    // 如果是数组，就把这个数组扁平化
    if (node && node.pop) {
      for (length = node.length; length--; ) {
        rest.push(node[length])
      }
    } else if (node != null && node !== true && node !== false) {
      // null, boolean不处理
      children.push(node)
    }
  }

  return typeof name === "function"
    ? name(attributes || {}, children)
    : {
        nodeName: name,
        attributes: attributes || {},
        children: children,
        key: attributes && attributes.key
      }
}

export function app(state, actions, view, container) {
  // 拿到数组的map方法，方便类数组去调用
  var map = [].map
  // container下的第一个子元素
  var rootElement = (container && container.children[0]) || null
  // 把container下的第一个子元素转换成vdom，作为初始的vdom进行后续比较
  var oldNode = rootElement && recycleElement(rootElement)
  var lifecycle = []
  var skipRender
  var isRecycling = true
  // 对state做一个浅拷贝
  var globalState = clone(state)
  // actions做包装
  var wiredActions = wireStateToActions([], globalState, clone(actions))

  scheduleRender()

  return wiredActions

  /**
   * 把dom对象转换成vDom
   * @param {element} element 
   */
  function recycleElement(element) {
    return {
      nodeName: element.nodeName.toLowerCase(),
      attributes: {},
      children: map.call(element.childNodes, function(element) {
        return element.nodeType === 3 // Node.TEXT_NODE
          ? element.nodeValue
          : recycleElement(element)
      })
    }
  }

  /**
   * 返回vDom
   * @param {*} node 
   */
  function resolveNode(node) {
    return typeof node === "function"
      ? resolveNode(node(globalState, wiredActions))
      : node != null
        ? node
        : ""
  }

  function render() {
    // flag置为没有在渲染
    skipRender = !skipRender

    // 拿到虚拟dom树
    var node = resolveNode(view)

    if (container && !skipRender) {
      // 新旧vdom对比
      rootElement = patch(container, rootElement, oldNode, (oldNode = node))
    }

    isRecycling = false

    while (lifecycle.length) lifecycle.pop()()
  }

  /**
   * 判断当前是否正在render
   * 没有就异步调用render方法
   */
  function scheduleRender() {
    if (!skipRender) {
      skipRender = true
      setTimeout(render)
    }
  }

  /**
   * 浅拷贝+继承
   * @param {Object} target 
   * @param {Object} source 
   */
  function clone(target, source) {
    var out = {}

    for (var i in target) out[i] = target[i]
    for (var i in source) out[i] = source[i]

    return out
  }

  /**
   * 给特定路径设置值
   * @param {string[]} path key的路径
   * @param {any} value 值
   * @param {Object} source 操作的对象
   */
  function setPartialState(path, value, source) {
    var target = {}
    if (path.length) {
      target[path[0]] =
        path.length > 1
          ? setPartialState(path.slice(1), value, source[path[0]]) // 递归
          : value
      return clone(source, target)
    }
    return value
  }

  /**
   * 根据给定的路径从嵌套对象中获取结果
   * @param {string[]} path ['key1', 'key2', 'key3' ....]
   * @param {Object} source Object
   */
  function getPartialState(path, source) {
    var i = 0
    while (i < path.length) {
      source = source[path[i++]]
    }
    return source
  }

  /**
   * 包装actions，使得actions中的所有function都能调用到state和actions
   * 且当state改变的时候，触发重绘
   * @param {string[]} path 
   * @param {Object} state 
   * @param {Object} actions 
   */
  function wireStateToActions(path, state, actions) {
    // 循环actions
    for (var key in actions) {
      // 如果是方法，执行，如果不是说明是有path的，递归执行
      typeof actions[key] === "function"
        ? (function(key, action) {
          // 重新对action进行封装，相当于invokeFn了一下
            actions[key] = function(data) {
              // action是一个function或者是一个返回匿名函数的function
              
              // 如果是普通的function，直接执行，拿到返回值
              var result = action(data)
              
              if (typeof result === "function") {
                // 如果是返回匿名函数的function，传递当前state再执行
                result = result(getPartialState(path, globalState), actions)
              }

              // 如果有返回值
              // 且state发生了改变
              // 如果是promise的话，不处理，promise、null、undefined不触发重绘
              // 相当于框架本身不去兼容promise的情况，在promise完成后需要自己去调用action
              if (
                result &&
                result !== (state = getPartialState(path, globalState)) &&
                !result.then // !isPromise
              ) {
                // 触发重绘
                scheduleRender(
                  (globalState = setPartialState(
                    path,
                    clone(state, result), // 拿action返回的值和原state做继承，生成新的state
                    globalState
                  ))
                )
              }

              return result
            }
          })(key, actions[key])
        : wireStateToActions( // 说明是层级
            path.concat(key),
            (state[key] = clone(state[key])),
            (actions[key] = clone(actions[key]))
          )
    }

    return actions
  }

  function getKey(node) {
    return node ? node.key : null
  }

  /**
   * 这里是个代理函数
   * 执行的是elements.events中相对应的方法
   * @param {*} event 事件对象
   */
  function eventListener(event) {
    return event.currentTarget.events[event.type](event)
  }

  /**
   * 更新元素的attribute
   * @param {element} element dom元素
   * @param {string} name key
   * @param {any} value value
   * @param {any} oldValue
   * @param {boolean} isSvg 
   */
  function updateAttribute(element, name, value, oldValue, isSvg) {
    if (name === "key") {
      // 如果name是key，不做任何处理，key只保存在vdom中
    } else if (name === "style") {
      // 如果是样式
      for (var i in clone(oldValue, value)) {
        var style = value == null || value[i] == null ? "" : value[i]
        if (i[0] === "-") {
          // 处理-webkit-xxxx 的情况
          // 其余等效
          element[name].setProperty(i, style)
        } else {
          element[name][i] = style
        }
      }
    } else {
      // 绑定时间
      if (name[0] === "o" && name[1] === "n") {
        name = name.slice(2)

        if (element.events) {
          // 如果已经绑定过事件
          // 旧的事件为空
          // 就从events中取出旧的事件
          if (!oldValue) oldValue = element.events[name]
        } else {
          // 如果没绑定过事件
          // 初始化事件对象
          element.events = {}
        }

        // 在events中替换新的事件
        element.events[name] = value

        if (value) {
          if (!oldValue) {
            // 如果value有值说明要绑定一个事件
            // oldvalue从旧的event中取出来的还没有值得话
            // 就说明这个事件没有绑定过
            // 直接绑定一下
            element.addEventListener(name, eventListener)
          }
        } else {
          // value是空，就解除绑定
          element.removeEventListener(name, eventListener)
        }
      } else if (name in element && name !== "list" && !isSvg) {
        // 原生属性，直接赋值
        element[name] = value == null ? "" : value
      } else if (value != null && value !== false) {
        // 非原生属性
        element.setAttribute(name, value)
      }

      // 删除属性
      if (value == null || value === false) {
        element.removeAttribute(name)
      }
    }
  }

  /**
   * 创建dom元素
   * @param {vdom} node 虚拟dom节点
   * @param {boolean} isSvg 是否是svg
   */
  function createElement(node, isSvg) {
    // string和number渲染为text节点
    // 当isSvg或者nodeName为svg的时候，创建svg元素
    // 其余根据nodeName创建节点
    var element =
      typeof node === "string" || typeof node === "number"
        ? document.createTextNode(node)
        : (isSvg = isSvg || node.nodeName === "svg")
          ? document.createElementNS(
              "http://www.w3.org/2000/svg",
              node.nodeName
            )
          : document.createElement(node.nodeName)

    var attributes = node.attributes
    if (attributes) {
      // 如果有oncreate钩子，放入生命周期队列中
      if (attributes.oncreate) {
        lifecycle.push(function() {
          attributes.oncreate(element)
        })
      }
      // 创建子节点
      for (var i = 0; i < node.children.length; i++) {
        element.appendChild(
          createElement(
            (node.children[i] = resolveNode(node.children[i])),
            isSvg
          )
        )
      }

      // 更新attribute
      for (var name in attributes) {
        // 创建的时候oldvalue为空
        updateAttribute(element, name, attributes[name], null, isSvg)
      }
    }

    return element
  }

  
  /**
   * 
   * @param {element} element 
   * @param {object} oldAttributes 旧的
   * @param {object} attributes 
   * @param {boolean} isSvg 
   */
  function updateElement(element, oldAttributes, attributes, isSvg) {
    for (var name in clone(oldAttributes, attributes)) {
      if (
        attributes[name] !==
        (name === "value" || name === "checked"
          ? element[name]
          : oldAttributes[name])
      ) {
        updateAttribute(
          element,
          name,
          attributes[name],
          oldAttributes[name],
          isSvg
        )
      }
    }

    var cb = isRecycling ? attributes.oncreate : attributes.onupdate
    if (cb) {
      lifecycle.push(function() {
        cb(element, oldAttributes)
      })
    }
  }

  function removeChildren(element, node) {
    var attributes = node.attributes
    if (attributes) {
      for (var i = 0; i < node.children.length; i++) {
        removeChildren(element.childNodes[i], node.children[i])
      }

      if (attributes.ondestroy) {
        attributes.ondestroy(element)
      }
    }
    return element
  }

  /**
   * 
   * @param {*} parent 
   * @param {*} element 
   * @param {*} node 
   */
  function removeElement(parent, element, node) {
    function done() {
      parent.removeChild(removeChildren(element, node))
    }

    var cb = node.attributes && node.attributes.onremove
    if (cb) {
      cb(element, done)
    } else {
      done()
    }
  }

  /**
   * diff算法
   * @param {element} parent 父级节点
   * @param {element} element 
   * @param {vdomTree} oldNode 旧的vdom树
   * @param {vdomTree} node 新的vdom树
   * @param {boolean} isSvg 是否是svg
   */
  function patch(parent, element, oldNode, node, isSvg) {
    if (node === oldNode) {
      // 如果新旧dom相等，说明没变化，不做任何操作
    } else if (oldNode == null || oldNode.nodeName !== node.nodeName) {
      // 如果旧的vdom为空
      // 或者标签类型发生了改变

      // 创建element元素，并设置attribute
      var newElement = createElement(node, isSvg)
      parent.insertBefore(newElement, element)

      if (oldNode != null) {
        // 这个地方是当标签类型发生了变化
        // 且旧的vdom不为空的时候
        removeElement(parent, element, oldNode)
      }

      element = newElement
    } else if (oldNode.nodeName == null) {
      // 说明之前的是textnode
      element.nodeValue = node
    } else {
      updateElement(
        element,
        oldNode.attributes,
        node.attributes,
        (isSvg = isSvg || node.nodeName === "svg")
      )

      var oldKeyed = {}
      var newKeyed = {}
      var oldElements = []
      var oldChildren = oldNode.children
      var children = node.children

      for (var i = 0; i < oldChildren.length; i++) {
        oldElements[i] = element.childNodes[i]

        var oldKey = getKey(oldChildren[i])
        if (oldKey != null) {
          oldKeyed[oldKey] = [oldElements[i], oldChildren[i]]
        }
      }

      var i = 0
      var k = 0

      while (k < children.length) {
        var oldKey = getKey(oldChildren[i])
        var newKey = getKey((children[k] = resolveNode(children[k])))

        if (newKeyed[oldKey]) {
          i++
          continue
        }

        if (newKey != null && newKey === getKey(oldChildren[i + 1])) {
          if (oldKey == null) {
            removeElement(element, oldElements[i], oldChildren[i])
          }
          i++
          continue
        }

        if (newKey == null || isRecycling) {
          if (oldKey == null) {
            patch(element, oldElements[i], oldChildren[i], children[k], isSvg)
            k++
          }
          i++
        } else {
          var keyedNode = oldKeyed[newKey] || []

          if (oldKey === newKey) {
            patch(element, keyedNode[0], keyedNode[1], children[k], isSvg)
            i++
          } else if (keyedNode[0]) {
            patch(
              element,
              element.insertBefore(keyedNode[0], oldElements[i]),
              keyedNode[1],
              children[k],
              isSvg
            )
          } else {
            patch(element, oldElements[i], null, children[k], isSvg)
          }

          newKeyed[newKey] = children[k]
          k++
        }
      }

      while (i < oldChildren.length) {
        if (getKey(oldChildren[i]) == null) {
          removeElement(element, oldElements[i], oldChildren[i])
        }
        i++
      }

      for (var i in oldKeyed) {
        if (!newKeyed[i]) {
          removeElement(element, oldKeyed[i][0], oldKeyed[i][1])
        }
      }
    }
    return element
  }
}
