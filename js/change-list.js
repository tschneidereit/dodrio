const decoder = new TextDecoder();

function top(stack) {
  return stack[stack.length - 1];
}

function string(mem, pointer, length) {
  const buf = mem.subarray(pointer, pointer + length);
  return decoder.decode(buf);
}

class Listener {
  constructor(a, b, eventType, trampoline, el) {
    this.a = a;
    this.b = b;
    this.eventType = eventType;
    this.trampoline = trampoline;
    this.el = el;
    this.callback = this.callback.bind(this);
  }

  callback(event) {
    this.trampoline(event, this.a, this.b);
  }
}

// export
class ChangeList {
  constructor(container) {
    this.listeners = new Set();
    this.trampoline = null;
    this.container = container;
    this.ranges = [];
    this.stack = [];
    this.strings = new Map();
  }

  unmount() {
    for (const listener of this.listeners) {
      listener.el.removeEventListener(listener.eventType, listener.callback);
      listener.trampoline = () => {
        throw new Error("invocation of listener after it has been removed");
      };
      listener.a = 0;
      listener.b = 0;
    }

    // Null out all of our properties just to ensure that if we mistakenly ever
    // call a method on this instance again, it will throw.
    this.listeners = null;
    this.trampoline = null;
    this.container = null;
    this.ranges = null;
    this.stack = null;
    this.strings = null;
  }

  addChangeListRange(start, len) {
    this.ranges.push(start);
    this.ranges.push(len);
  }

  applyChanges(memory) {
    if (this.ranges.length == 0) {
      return;
    }

    this.stack.push(this.container.firstChild);
    const mem8 = new Uint8Array(memory.buffer);
    const mem32 = new Uint32Array(memory.buffer);

    for (let i = 0; i < this.ranges.length; i += 2) {
      const start = this.ranges[i];
      const len = this.ranges[i + 1];
      this.applyChangeRange(mem8, mem32, start, len);
    }

    this.ranges.length = 0;
    this.stack.length = 0;
  }

  applyChangeRange(mem8, mem32, start, len) {
    const end = (start + len) / 4;
    let changeList = this;
    for (let i = start / 4; i < end; ) {
      const op = mem32[i++];
      switch (op) {

        // SetText
        case 0: {
          const pointer = mem32[i++];
          const length = mem32[i++];
          const str = string(mem8, pointer, length);
          top(changeList.stack).textContent = str;
          break;
        }

        // RemoveSelfAndNextSiblings
        case 1: {
          const node = changeList.stack.pop();
          let sibling = node.nextSibling;
          while (sibling) {
            const temp = sibling.nextSibling;
            sibling.remove();
            sibling = temp;
          }
          node.remove();
          break;
        }

        // ReplaceWith
        case 2: {
          const newNode = changeList.stack.pop();
          const oldNode = changeList.stack.pop();
          oldNode.replaceWith(newNode);
          changeList.stack.push(newNode);
          break;
        }

        // SetAttribute
        case 3: {
          const nameId = mem32[i++];
          const valueId = mem32[i++];
          const name = changeList.getString(nameId);
          const value = changeList.getString(valueId);
          const node = top(changeList.stack);
          node.setAttribute(name, value);

          // Some attributes are "volatile" and don't work through `setAttribute`.
          if (name === "value") {
            node.value = value;
          }
          if (name === "checked") {
            node.checked = true;
          }
          if (name === "selected") {
            node.selected = true;
          }
          break;
        }

        // RemoveAttribute
        case 4: {
          const nameId = mem32[i++];
          const name = changeList.getString(nameId);
          const node = top(changeList.stack);
          node.removeAttribute(name);

          // Some attributes are "volatile" and don't work through `removeAttribute`.
          if (name === "value") {
            node.value = null;
          }
          if (name === "checked") {
            node.checked = false;
          }
          if (name === "selected") {
            node.selected = false;
          }
          break;
        }

        // PushFirstChild
        case 5: {
          changeList.stack.push(top(changeList.stack).firstChild);
          break;
        }

        // PopPushNextSibling
        case 6: {
          const node = changeList.stack.pop();
          changeList.stack.push(node.nextSibling);
          break;
        }

        // Pop
        case 7: {
          changeList.stack.pop();
          break;
        }

        // AppendChild
        case 8: {
          const child = changeList.stack.pop();
          top(changeList.stack).appendChild(child);
          break;
        }

        // CreateTextNode
        case 9: {
          const pointer = mem32[i++];
          const length = mem32[i++];
          const text = string(mem8, pointer, length);
          changeList.stack.push(document.createTextNode(text));
          break;
        }

        // CreateElement
        case 10: {
          const tagNameId = mem32[i++];
          const tagName = changeList.getString(tagNameId);
          changeList.stack.push(document.createElement(tagName));
          break;
        }

        // NewEventListener
        case 11: {
          const eventId = mem32[i++];
          const eventType = changeList.getString(eventId);
          const a = mem32[i++];
          const b = mem32[i++];
          const el = top(changeList.stack);
          const listener = new Listener(a, b, eventType, changeList.eventsTrampoline, el);
          changeList.listeners.add(listener);
          el.addEventListener(eventType, listener.callback);
          el["dodrio-" + eventType] = listener;
          break;
        }

        // UpdateEventListener
        case 12: {
          const eventId = mem32[i++];
          const eventType = changeList.getString(eventId);
          const el = top(changeList.stack);
          const listener = el["dodrio-" + eventType];
          listener.a = mem32[i++];
          listener.b = mem32[i++];
          break;
        }

        // RemoveEventListener
        case 13: {
          const eventId = mem32[i++];
          const eventType = changeList.getString(eventId);
          const el = top(changeList.stack);
          const listener = el["dodrio-" + eventType];
          el.removeEventListener(eventType, listener.callback);
          changeList.listeners.delete(listener);
          break;
        }

        // AddString
        case 14: {
          const pointer = mem32[i++];
          const length = mem32[i++];
          const id = mem32[i++];
          const str = string(mem8, pointer, length);
          changeList.addString(str, id);
          break;
        }

        default:
          throw new Error("Unknown op: " + op);
      }
    }
  }

  addString(str, id) {
    this.strings.set(id, str);
  }

  getString(id) {
    return this.strings.get(id);
  }

  initEventsTrampoline(trampoline) {
    this.eventsTrampoline = (...args) => {
      trampoline(...args);
    };
  }
}
window.ChangeList = ChangeList;
