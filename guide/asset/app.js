const menu = document.querySelector('#menu')
const search = document.querySelector('#search')
const result = document.querySelector('#search-result')
let index
let lookup
menu.addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open')
  menu.setAttribute('aria-expanded', String(open))
})
function hide() { result.hidden = true }
search.addEventListener('input', async () => {
  const query = search.value.trim().toLowerCase()
  if (!query) return hide()
  try {
    lookup ||= fetch('../asset/search.json').then(response => {
      if (!response.ok) throw new Error('Search unavailable')
      return response.json()
    }).catch(error => { lookup = null; throw error })
    index ||= await lookup
    if (search.value.trim().toLowerCase() !== query) return
    const match = index.map(page => ({ page, score: query.split(/\s+/).reduce((score, word) => score + (page.title.toLowerCase().includes(word) ? 6 : 0) + (page.text.toLowerCase().includes(word) ? 1 : 0), 0) }))
      .filter(item => query.split(/\s+/).every(word => item.page.text.toLowerCase().includes(word) || item.page.title.toLowerCase().includes(word)))
      .sort((a,b) => b.score - a.score).slice(0, 8)
    result.replaceChildren()
    for (const { page } of match) {
      const link = document.createElement('a')
      link.href = `../${page.slug}/`
      link.textContent = page.title
      const detail = document.createElement('small')
      detail.textContent = page.description
      link.append(detail)
      result.append(link)
    }
    if (!match.length) {
      const text = document.createElement('p')
      text.textContent = 'No guide found. Try “stock”, “equipment” or “purchase”.'
      result.append(text)
    }
    result.hidden = false
  } catch {
    result.textContent = 'Search could not load. Use the navigation to browse guides.'
    result.hidden = false
  }
})
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { hide(); search.focus() }
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    event.preventDefault(); search.focus()
  }
})
document.addEventListener('click', event => {
  if (!result.contains(event.target) && !search.contains(event.target)) hide()
})
document.querySelector('#print').addEventListener('click', () => window.print())
