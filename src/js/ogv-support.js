//
// -- ogv-support.js
// https://github.com/brion/ogv.js
// Copyright (c) 2013-2024 Brooke Vibber
//

import OGVCompat from './OGVCompat.js';
const OGVVersion = __OGV_FULL_VERSION__;

if (typeof window === 'object') {
    // 1.0-compat globals
    window.OGVCompat = OGVCompat;
    window.OGVVersion = OGVVersion;
}

export {
    OGVCompat,
    OGVVersion
};
