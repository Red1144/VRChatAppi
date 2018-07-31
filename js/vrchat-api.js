const https = require('https');
const storage = require('electron-json-storage');
const crypto = require('crypto');

/**
 * Encryption key for our file
 * @type {string}
 */
const encryption_key = '*~(Iqzu[dwS0~8q&H"*^3x@jnSDa0h';

/**
 * Base URL for the VRChat API
 * @type {string}
 */
const base_url = "api.vrchat.cloud";

/**
 * VRChat client token, {@see setClientToken} to initialize
 * @type {string}
 */
let clientToken = '';

/**
 * VRChat account token, {@see login} to initialize
 * @type {string}
 */
let authToken = '';

/**
 * Cached login information
 * @type {Object}
 */
let loginInfo = {};

/**
 * Cached world information
 * @type {Array}
 */
let worldCache = [];

/**
 * Enable auth token reinitialization - Used for debugging without creating too many HTTP requests
 */
const enableTokenReint = false;

/**
 * Saves the session information to a file for later use
 * @param {function} callback   Callback function
 */
function saveSession(callback) {
	const data = JSON.stringify({
		authToken: authToken,
		clientToken: clientToken,
		loginInfo: loginInfo
	});
	const cipher = crypto.createCipher('aes256', encryption_key);
	let crypted = cipher.update(data, 'utf8', 'hex');
	crypted += cipher.final('hex');
	storage.set("session", {
		encrypted: Buffer.from(crypted).toString('base64')
	}, (error) => {
		if (error) {
			console.log("Error: " + error);
			return;
		}
		callback();
	});
}

/**
 * Loads the session information from a file
 * @param callback  Callback function
 */
function loadSession(callback) {
	storage.has("session", (error, hasKey) => {
		if (hasKey) {
			storage.get("session", (error, data) => {
				if (error) {
					console.log(error);
					return;
				}
				const encrypted = Buffer.from(data.encrypted, 'base64').toString('utf-8');
				const decipher = crypto.createDecipher('aes256', encryption_key);
				let dec = decipher.update(encrypted, 'hex', 'utf8');
				dec += decipher.final('utf8');
				const i = JSON.parse(dec);
				if (!enableTokenReint) {
					// if we're allowed to use cached login tokens
					authToken = i.authToken;
					clientToken = i.clientToken;
					loginInfo = {
						username: i.loginInfo.username,
						displayName: i.loginInfo.displayName,
						avatarImage: i.loginInfo.avatarImage,
						id: i.loginInfo.id
					};
					callback(hasKey);
				} else {
					// if not
					setClientToken(() => {
						login(i.loginInfo.loginName, i.loginInfo.loginPassword, () => {
							callback(hasKey);
						})
					});
				}
			});
		} else {
			callback(false);
		}
	});
}

/**
 * Saves cached worlds to disk
 */
function saveWorlds() {
	storage.set("worlds", {
		worlds: worldCache
	}, (error) => {
		if (error) {
			console.log("Error: " + error);
		}
	});
}

/**
 * Loads world cache from disk
 */
function loadWorlds() {
	storage.has("worlds", (error, hasKey) => {
		if (hasKey) {
			storage.get("worlds", (error, data) => {
				if (error) {
					console.log(error);
					return;
				}
				worldCache = data.worlds;
			});
		}
	});
}

/**
 * Get VRChat client token required to send API requests
 * @param {function} callback   Callback function
 * @return {string}             VRChat client token
 */
function setClientToken(callback) {
	sendGETRequest("/config", (data) => {
		clientToken = data.apiKey;
		callback();
	});
}

/**
 * Logs you out
 * @param {function} callback   Callback function
 */
function logout(callback) {
	storage.has("session", (error, hasKey) => {
		if (hasKey) {
			storage.remove("session", (error, data) => {
				authToken = '';
				clientToken = '';
				loginInfo = {};
				callback();
			});
		} else {
			callback();
		}
	});
}

/**
 * Used to login on the VRChat API
 * @param {string} name        VRChat username
 * @param {string} password    VRChat password
 * @param {function} callback  Callback function
 */
function login(name, password, callback) {
	if (!isClientToken()) {
		console.log("Error! client token not set => {@see login}");
		// TODO error handling
		return
	}
	sendGETRequest(formatURL("/auth/user"), (data, headers) => {
		if (data.error) {
			callback(data.error.message);
		} else {
			authToken = getAuthKey(headers).auth;
			loginInfo = {
				username: data.username,
				displayName: data.displayName,
				avatarImage: data.currentAvatarThumbnailImageUrl,
				id: data.id,
				loginPassword: password,
				loginName: name
			};
			saveSession(() => {
				callback(data);
			});
		}
	}, (name + ":" + password));
}

/**
 * Get VRChat friend info
 * @param {function} callback  The callback function
 */
function getFriends(callback) {
	if (!isClientToken()) {
		console.log("Error! client token not set => {@see getFriends}");
		// TODO error handling
		return
	}

	if (!isAuthToken()) {
		console.log("Error! auth token not set => {@see getFriends}");
		// TODO error handling
		return
	}

	sendGETRequest(formatURL("/auth/user/friends"), (data) => {
		callback(data);
	});
}

/**
 * List own avatars
 * @param amount        How many avatars to get
 * @param offset        Offset
 * @param callback      Callback function
 */
function getAvatars(amount, offset, callback) {
	const url = formatURL("/avatars") + "&user=me&releaseStatus=all&n=" + amount + "&offset=" + offset + "&sort=updated&order=descending";
	sendGETRequest(url, (data) => {
		callback(data);
	})
}

/**
 * List own worlds
 * @param amount        How many worlds to get
 * @param callback      Callback function
 */
function getWorlds(amount, callback) {
	const url = formatURL("/worlds") + "&user=me&releaseStatus=all&n=" + amount + "&sort=updated&order=descending";
	sendGETRequest(url, (data) => {
		callback(data);
	})
}

/**
 * Get avatar by ID
 * @param id            The ID of the avatar
 * @param callback      Callback function
 */
function getAvatar(id, callback) {
	sendGETRequest(formatURL("/avatars/" + id), (data) => {
		callback(data);
	})
}

/**
 * Get own world by ID
 * @param id            The ID of the world
 * @param callback      Callback function
 */
function getOwnWorld(id, callback) {
	sendGETRequest(formatURL("/worlds/" + id), (data) => {
		callback(data);
	})
}


/**
 * Get world by ID
 * @param id            ID of the world
 * @param callback      Callback function
 */
function getWorld(id, callback) {
	for (let i = 0; i < worldCache.length; i++) {
		if (worldCache[i].id === id) {
			callback(worldCache[i]);
			return;
		}
	}

	if (!isClientToken()) {
		console.log("Error! client token not set => {@see getWorld}");
		// TODO error handling
		return
	}

	if (!isAuthToken()) {
		console.log("Error! auth token not set => {@see getWorld}");
		// TODO error handling
		return
	}

	sendGETRequest(formatURL("/worlds/" + id), (data) => {
		const world = {
			id: data.id,
			name: data.name,
			image: data.thumbnailImageURL,
			description: data.description,
			authorName: data.authorName,
			status: data.releaseStatus,
		};

		let found = false;

		for (let i = 0; i < worldCache.length; i++) {
			if (worldCache[i].id === id) {
				found = true;
				break;
			}
		}
		if (found === false) {
			worldCache.push(world);
		}
		saveWorlds();
		callback(world);
	});
}

/**
 * Get world metadata from ID
 * @param id            World ID, starts with wrld_
 * @param instance      Instance, everything after the world ID
 * @param callback      Callback function
 */
function getWorldMetadata(id, instance, callback) {
	sendGETRequest(formatURL("/worlds/" + id + "/" + instance), (data) => {
		callback(data);
	});
}

/**
 * Get player moderations you've sent
 * @param callback      The callback function
 */
function modGetMine(callback) {
	sendGETRequest(formatURL("/auth/user/playermoderations"), (data) => {
		callback(data);
	});
}

/**
 * Get player moderations against you
 * @param callback      The callback function
 */
function modGetAgainstMe(callback) {
	sendGETRequest(formatURL("/auth/user/playermoderated"), (data) => {
		callback(data);
	});
}

/**
 * Verify if client API token exists
 * @return {boolean}    Has the client API token been initialized
 */
function isClientToken() {
	return clientToken !== '';
}

/**
 * Verify if account auth token exists
 * @return {boolean}    Has the auth token been initialized
 */
function isAuthToken() {
	return authToken !== '';
}

/**
 * Ready the URL to be valid VRChat API URL
 * @param {string} location     Location of the URL
 * @return {string}             Formatted URL
 */
function formatURL(location) {
	return location + "?apiKey=" + clientToken;
}

/**
 * Send a HTTP GET request to the target URL
 * @param {string} location          Target URL
 * @param {function} callback  Callback function
 * @param {string} [basic]      Basic auth if required
 */

function sendGETRequest(location, callback, basic) {
	const options = {
		host: base_url,
		path: "/api/1",
		port: 443,
		method: 'GET',
		headers: {
			"Content-Type": "application/json"
		}
	};
	options.path += location;
	if (basic !== undefined) {
		options.headers.Authorization = "Basic " + Buffer.from(basic).toString('base64')
	}

	if (authToken !== '') {
		options.headers["Cookie"] = "auth=" + authToken;
	}

	const request = https.request(options, (resp) => {
		let data = '';
		resp.on('data', (chunk => {
			data += chunk;
		}));
		resp.on('end', () => {
			callback(JSON.parse(data), resp.headers);
		});
		console.log("Request sent")
	}).on('error', err => {
		console.log(err);
	});
	request.end();
}

/**
 * Parse auth token from HTTP cookies
 * @param headers   The HTTP request headers
 */
function getAuthKey(headers) {
	const list = {};
	const rc = headers['set-cookie'][1];

	if (rc.length < 1) {
		return null
	}

	rc && rc.split(';').forEach(function (cookie) {
		const parts = cookie.split('=');
		list[parts.shift().trim()] = decodeURI(parts.join('='));
	});

	return list;
}

/**
 * Getter for {@see loginInfo}
 * @return {Object}
 */
function getLoginInfo() {
	return loginInfo;
}

module.exports = {
	setClientToken: (callback) => {
		setClientToken(callback)
	},

	login: (name, password, callback) => {
		login(name, password, callback)
	},

	getFriends: (callback) => {
		getFriends(callback)
	},

	loadSession: (callback) => {
		loadSession(callback)
	},

	loadWorlds: () => {
		loadWorlds()
	},

	getWorld: (id, callback) => {
		getWorld(id, callback)
	},

	getLoginInfo: () => {
		return getLoginInfo();
	},

	getWorldMetadata: (id, instance, callback) => {
		getWorldMetadata(id, instance, callback)
	},

	modGetAgainstMe: (callback) => {
		modGetAgainstMe(callback)
	},

	modGetMine: (callback) => {
		modGetMine(callback)
	},

	getAvatars: (amount, offset, callback) => {
		getAvatars(amount, offset, callback)
	},

	getAvatar: (id, callback) => {
		getAvatar(id, callback)
	},

	getWorlds: (amount, callback) => {
		getWorlds(amount, callback)
	},
	getOwnWorld: (id, callback) => {
		getOwnWorld(id, callback)
	},

	logout: (callback) => {
		logout(callback);
	}
};