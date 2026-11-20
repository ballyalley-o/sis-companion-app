const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../app/(tab)/_layout.tsx'), 'utf8')
const output = ts.transpileModule(source + '\nexport { DesktopSidebar }', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const routeSource = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/route/path.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
const route = {}
vm.runInNewContext(routeSource, { exports: route })
const exportsObject = {}
vm.runInNewContext(output, {
  exports: exportsObject,
  require: name => {
    if (name === 'react/jsx-runtime') return require(name)
    if (name === 'react-native') return { Platform: { OS: 'web' }, Pressable: 'Pressable', View: 'View' }
    if (name === 'expo-image') return { Image: 'Image' }
    if (name === 'expo-router') return { Link: 'Link', useRouter: () => ({ push() {} }) }
    if (name === 'expo-router/unstable-native-tabs') return {}
    if (name === 'config/navigation') return {}
    if (name === 'state/auth') return {}
    if (name === 'route/path') return route
    if (name === 'component/version-info') return { VersionInfo: 'VersionInfo' }
    if (name === 'component/ui') return { Body: 'Body', Icon: 'Icon', Label: 'Label' }
    if (name === 'design/theme') return { makeStyles: () => () => ({}), useTheme: () => ({ colors: {} }), fonts: {}, spacing: {} }
    if (name.endsWith('.png')) return 1
    throw new Error(`Unexpected dependency: ${name}`)
  },
})
function collect(element, type, result = []) {
  if (Array.isArray(element)) { element.forEach(child => collect(child, type, result)); return result }
  if (!element || !element.props) return result
  if (element.type === type) result.push(element)
  collect(element.props.children, type, result)
  return result
}
const names = ['index', 'stock', 'equipment', 'orders', 'more']
const titles = ['Home', 'Stock', 'Equipment', 'Orders', 'More']
const state = { routes: names.map(name => ({ name, key: name })), index: 0 }
const descriptors = Object.fromEntries(names.map((name, i) => [name, { options: { title: titles[i] } }]))
let prevented = false
const emitted = []
const emitter = { emit: event => { emitted.push(event); return { defaultPrevented: prevented } } }
const switched = []
const navigateToTab = key => switched.push(key)
let tree = exportsObject.DesktopSidebar({ state, descriptors, emitter, navigateToTab, user: { role: 'admin' } })
const tabs = collect(tree, 'Pressable').filter(tab => tab.props.testID?.startsWith('sidebar-') && tab.props.testID !== 'sidebar-warehouse-map')
assert.deepEqual(tabs.map(tab => tab.props.testID), names.map(name => `sidebar-${name}`))
for (const tab of tabs) tab.props.onPress()
assert.deepEqual(switched, ['stock', 'equipment', 'orders', 'more'])
assert.equal(emitted.length, 5)
prevented = true
tabs[1].props.onPress()
assert.deepEqual(switched, ['stock', 'equipment', 'orders', 'more'])
tree = exportsObject.DesktopSidebar({ state, descriptors, emitter, navigateToTab, user: { role: 'driller' } })
assert.equal(collect(tree, 'Pressable').some(tab => tab.props.testID === 'sidebar-orders'), false)
console.log('SDK 58 sidebar switches all unfocused tabs by key, respects cancellation, and hides Orders from drillers.')
