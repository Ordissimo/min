if (typeof require !== 'undefined') {
  var settings = require('util/settings/settings.js')
}
// otherwise, assume window.settings exists already

var currentSearchEngine = {
  name: '',
  searchURL: '%s'
}

var defaultSearchEngine = 'Ordissimo'

var searchEngines = {
  ordissimo: {
    name: 'Ordissimo',
    searchURL: 'http://www.substantiel.fr/liens/moteurrechercheordissimo.php?q=%s&lang=' + getCurrentLanguage().substring(0,2)
  }
}

settings.listen('searchEngine', function (value) {

   currentSearchEngine = searchEngines[defaultSearchEngine]
})

var searchEngine = {
  getCurrent: function () {
    return currentSearchEngine
  },
  isSearchURL: function (url) {
    if (!currentSearchEngine.name || currentSearchEngine.name === 'none') {
      return false
    } else {
      let searchFragment = currentSearchEngine.searchURL.split('%s')[0]
      return url.startsWith(searchFragment)
    }
  },
  getSearch: function (url) {
    var urlObj
    try {
      urlObj = new URL(url)
    } catch (e) {
      return null
    }
    for (var e in searchEngines) {
      if (!searchEngines[e].queryParam) {
        continue
      }
      var engineURL = new URL(searchEngines[e].searchURL)
      if (engineURL.hostname === urlObj.hostname && engineURL.pathname === urlObj.pathname) {
        if (urlObj.searchParams.get(searchEngines[e].queryParam)) {
          return {
            engine: searchEngines[e].name,
            search: urlObj.searchParams.get(searchEngines[e].queryParam)
          }
        }
      }
    }
    return null
  }
}

if (typeof module === 'undefined') {
  window.currentSearchEngine = currentSearchEngine
} else {
  module.exports = searchEngine
}
