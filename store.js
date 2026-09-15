/**
 * Store factory — picks the DEMO or FIREBASE backend based on config.js
 * (BACKEND_MODE) and always returns a Promise<store>, so app.js never has
 * to branch on which backend is active.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.GtcStore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function createStore(config) {
    const mode = config.BACKEND_MODE || "demo";
    const isNode = typeof module !== "undefined" && module.exports;
    if (mode === "firebase") {
      const lib = isNode ? require("./store-firebase.js") : self.GtcStoreFirebase;
      return lib.createFirebaseStore(config.FIREBASE_CONFIG, config.SESSION_ID);
    }
    const lib = isNode ? require("./store-demo.js") : self.GtcStoreDemo;
    return Promise.resolve(lib.createDemoStore(config.SESSION_ID));
  }

  return { createStore: createStore };
});
