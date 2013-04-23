var HatebuParser = {
  parse: function(xml) {
    var entrys = xml.getElementsByTagName('item');

    var list = [];
    for (var i = 0, len = entrys.length; i < len; i++) {
      var bookmark = {};
      var entry = entrys[i];

      bookmark.id = i;
      bookmark.url = this.getFirstText(entry, 'link');
      bookmark.title = this.getFirstText(entry, 'title');
      bookmark.info = this.getFirstText(entry, 'description');
      bookmark.tags = this.getTags(entry);
      bookmark.time = this.getTime(entry);

      list.push(bookmark);
    }

    return list;
  },
  getTags: function(entry) {

    var tags = entry.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'subject');
    if (tags.length == 0) {
      return '';
    }

    var tagsList = [];
    for (var i = 0, len = tags.length; i < len; i++) {
      tagsList.push(tags[i].firstChild.nodeValue);
    }
    return '[' + tagsList.join('] [') + ']';
  },
  getTime: function(entry) {

    var firstChild = entry.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'date')[0].firstChild;
    return (firstChild) ? firstChild.nodeValue : '';
  },
  getFirstText: function(element, tagName) {
    var firstChild = element.getElementsByTagName(tagName)[0].firstChild;
    return (firstChild) ? firstChild.nodeValue : '';
  },

  getUserId: function(xml) {
    var url = xml.evaluate('//*[local-name()="channel"]/*[local-name()="link"]', xml, null, XPathResult.STRING_TYPE, null).stringValue;
    return url.substring('http://b.hatena.ne.jp/'.length, url.length - 1);
  }
}


var HatebuLoader = function(statusElement, loadingElement, database, callback) {
  this.init(statusElement, loadingElement, database, callback);
};

for (var prop in LoaderBase.prototype) {
  HatebuLoader.prototype[prop] = LoaderBase.prototype[prop];
}

HatebuLoader.prototype.url = 'http://b.hatena.ne.jp/dump?mode=rss';

HatebuLoader.prototype.insertSql = "INSERT INTO bookmark VALUES(:id, :url, :title, :info, :tags, :time, UPPER(:title||' '||:info||' '||:tags))",

HatebuLoader.prototype._load = function() {

  var self = this;
  var request = new XMLHttpRequest();

  request.onreadystatechange = function() {
    if (request.readyState == 4) {
      try {
        request.status
      } catch(e) {
        // error 
        self.error('error :connect error :' + self.url);
      }

      if (request.status == 200) {
        // success

        var wp = new XPCNativeWrapper(window, 'DOMParser()');
        var parser = new wp.DOMParser();

        var xml = parser.parseFromString(request.responseText.replace(/[\x00-\x1F]|\7F/g,""), 'text/xml');

        var userId = HatebuParser.getUserId(xml);

        prefBranch.setCharPref('userId', userId);
        incsearch.userId = userId;

        var bookmarks = HatebuParser.parse(xml);

        self.total = bookmarks.length;

        var generator = self.update(bookmarks);

        var executer = new Executer(
          generator,
          100,
          function(count) {
            self.dispLoading(count);
          },
          function() {
            self.dispEnd(bookmarks.length);
            self.callback();
          }
        );

        executer.run();

      } else if (request.status == 401){
        // Authorization Required
        var errMsg = 'error :' + request.status + ' :' + request.statusText + '<br /><br />';
        errMsg += 'Please login Hatena.<br />';
        errMsg += '<a href="https://www.hatena.ne.jp/login" target="_blank">https://www.hatena.ne.jp/login</a>';
        self.error(errMsg);
        throw errMsg;
      } else {
        // error
        var errMsg = 'error :' + request.status + ' :' + request.statusText + ' :' + self.url;
        self.error(errMsg);
        throw errMsg;
      }
    }
  };

  request.open("GET", this.url, true);
  request.send(null);
};


IncSearch.prototype.searchSql = 'SELECT url, title, info, tags, time FROM bookmark';

IncSearch.prototype.createEditUrl = function(bookmark) {
  return 'http://b.hatena.ne.jp/add?mode=confirm&url=' + escape(bookmark.url);
};


var EXTENSION_NAME = 'hatebu_incsearch';
var BookmarkLoader = HatebuLoader;

var createTableSql = "CREATE TABLE bookmark(id INTEGER, url TEXT, title TEXT, info TEXT, tags TEXT, time TEXT, search_text TEXT, PRIMARY KEY(id))";
