const https = require('https');
const storage = require('electron-json-storage');
const crypto = require('crypto');

/**
 * How many requests have been sent since the program was launched
 * @type {number}
 */
let requestTotal = 0;

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
 * Cached user tags
 * @type {{}}
 */
let tags = {};

/**
 * Cached world information
 * @type {Array}
 */
let worldCache = [];

/**
 * Cached request
 * @type {Object}
 */
let requestCache = {};

/**
 * User specified settings
 * @type {{useCarbon: boolean, allowPost: boolean, maxAvatars: number, maxWorlds: number, notifTimeout: number, sortingOrder: string}}
 */
let userSettings = {
	useCarbon: false,
	allowPost: false,
	maxAvatars: 10,
	maxWorlds: 20,
	notifTimeout: 5,
	sortingOrder: "updated"
};

/**
 * Enable auth token reinitialization - Used for debugging without creating too many HTTP requests,
 * if this is set to false in production I fucked up.
 * @type {boolean}
 */
const enableTokenReint = false;

/**
 * Clears the world cache
 */
function clearCache() {
	worldCache = [];
	saveWorlds();
}

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
		encrypted: Buffer.from(crypted).toString('base64'),
		tags: tags
	}, (error) => {
		if (error) {
			console.log("Error: " + error);
			return;
		}
		callback();
	});
}

/**
 * Saves user settings to a file
 * @param newSettings {object}      New settings to save
 */
function saveSettings(newSettings) {
	storage.set("settings", {
		settings: newSettings
	}, (error) => {
		if (error) {
			console.log("Error: " + error);
		}
	});
	userSettings = newSettings;
}

/**
 * Load user settings from a file
 */
function loadSettings() {
	storage.has("settings", (error, hasKey) => {
		if (hasKey) {
			storage.get("settings", (error, data) => {
				userSettings = data.settings;
			});
		}
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
				tags = data.tags;
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
		clientToken = data['apiKey'];
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
			storage.remove("session", () => {
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
		return
	}
	sendGETRequest(formatURL("/auth/user"), (data, headers) => {
		if (data.error) {
			callback(data.error.message);
		} else {
			authToken = getAuthKey(headers).auth;
			tags = data.tags;
			loginInfo = {
				username: data.username,
				displayName: data.displayName,
				avatarImage: data['currentAvatarThumbnailImageUrl'],
				id: data.id,
				loginPassword: password,
				loginName: name,
				friendGroups: {}
			};
			console.log(data);
			saveSession(() => {
				callback(data);
			});
		}
	}, (name + ":" + password));
}

/**
 * Get VRChat friend info
 * @param {function} callback   The callback function
 * @param {boolean} cached      Whether or not to send a cached version of the friends list
 */
function getFriends(callback, cached) {
	if (!isClientToken()) {
		console.log("Error! client token not set => {@see getFriends}");
		return
	}

	if (!isAuthToken()) {
		console.log("Error! auth token not set => {@see getFriends}");
		return
	}
	
	if (cached) {
		callback(getCachedRequest("friends"));
	} else {
		callback(JSON.parse("[{\"id\":\"usr_111c0ef4-951b-483e-9cb2-8845cf7cbafb\",\"username\":\"mocah_\",\"displayName\":\"Mocah_\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_af31a2ea-d72c-44da-afe3-359f276e37a6/4/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/724216459.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_legend\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\",\"system_trust_legend\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Sleepy\",\"location\":\"wrld_b2d24c29-1ded-4990-a90d-dd6dcc440300:84189\"},{\"id\":\"usr_c24b36f4-6ebc-484c-bc2a-e8361ccb192a\",\"username\":\"annieurushihara\",\"displayName\":\"AnnieLeonhardt_\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_341ae5a9-e6f2-463e-a22a-57e5cd6296e5/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/4174957236.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"sonic is lewd yaes\",\"location\":\"wrld_496b11e8-25a0-4f35-976d-faae5e00d60e:39362~hidden(usr_05f1e9a4-929c-4786-93fe-a24af272e091)~nonce(C7E60953B6CDA7C241ED48C2B5A4337C5E564F8D52353865BF1CF43A222ABF4A)\"},{\"id\":\"usr_7cbfaf98-bbb7-49bb-b2fb-64aea29f0802\",\"username\":\"riff\",\"displayName\":\"Riff\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_447942d2-a2f7-46f3-9c1e-fadf32ddd298/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/416846792.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"join me\",\"statusDescription\":\":(\",\"location\":\"wrld_401aa696-c26a-4218-9601-8fe9b0a54768:3270~hidden(usr_12df07a7-f3e5-4019-9360-80dc66a81a46)~nonce(5CA29111693F17F18D8A94641C49A917ED39DDD40FDCC055B5C92F6DEF305C69)\"},{\"id\":\"usr_8ad9a49e-7c7f-4bfb-8beb-2a7cb861547c\",\"username\":\"socknboppers\",\"displayName\":\"Socknboppers\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_9d1e9ea3-feb7-43a3-a865-b00b90f81c5c/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/3398147616.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_basic\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Don't forget about me.\",\"location\":\"wrld_401aa696-c26a-4218-9601-8fe9b0a54768:3270~hidden(usr_12df07a7-f3e5-4019-9360-80dc66a81a46)~nonce(5CA29111693F17F18D8A94641C49A917ED39DDD40FDCC055B5C92F6DEF305C69)\"},{\"id\":\"usr_20f862e0-c011-4968-b944-6f4c70fcce5b\",\"username\":\"aunker\",\"displayName\":\"Aunker\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_40741e91-0286-4bb8-8ff7-f57c81300661/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/1408101671.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"New CPU who dis\",\"location\":\"wrld_401aa696-c26a-4218-9601-8fe9b0a54768:3270~hidden(usr_12df07a7-f3e5-4019-9360-80dc66a81a46)~nonce(5CA29111693F17F18D8A94641C49A917ED39DDD40FDCC055B5C92F6DEF305C69)\"},{\"id\":\"usr_2d804725-e660-4dbd-ba5c-893c3ac1f09b\",\"username\":\"kaoura\",\"displayName\":\"Kaoura\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_32d7bb3e-6946-4ff5-9cf4-5ce060ff81fd/2/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/3058800730.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_legend\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"On Sorru's dic I mean wut\",\"location\":\"wrld_c0182e30-c27b-4438-8d19-dc02df22dd88:3324\"},{\"id\":\"usr_df10637a-c9ae-4b4c-a9ec-41e8c9d1c442\",\"username\":\"kellz\",\"displayName\":\"kellz\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_2ee24fc9-061d-401d-bee2-b998555e8dbf/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/3159772809.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_legend\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"state-0\",\"location\":\"wrld_401aa696-c26a-4218-9601-8fe9b0a54768:3270~hidden(usr_12df07a7-f3e5-4019-9360-80dc66a81a46)~nonce(5CA29111693F17F18D8A94641C49A917ED39DDD40FDCC055B5C92F6DEF305C69)\"},{\"id\":\"usr_cfb9bf78-ef70-4d16-a185-e500c48e4ec1\",\"username\":\"thedeadlybullet\",\"displayName\":\"TheDeadlyBullet\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_88ff7149-f688-4dc3-ad67-1b58a00df27c/2/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/2574727799.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_basic\",\"system_trust_veteran\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Country boiii...\",\"location\":\"private\"},{\"id\":\"usr_fd6213ba-33a9-4015-ab78-f8da8c087c99\",\"username\":\"sabit\",\"displayName\":\"Sabit\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_f09ff059-5695-490f-9877-270d5d1b3b30/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/3042641995.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_legend\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"You no pay? You no hot napkin! -\",\"location\":\"private\"},{\"id\":\"usr_12df07a7-f3e5-4019-9360-80dc66a81a46\",\"username\":\"khloe\",\"displayName\":\"Khloe\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_446a01d8-8fa5-4ebd-8458-f3b2d217dc55/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/148721690.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Blue is a hella wonderful color \",\"location\":\"private\"},{\"id\":\"usr_40fa0313-9c46-4abd-927d-c22524581213\",\"username\":\"scottymcdady\",\"displayName\":\"ScottyMcDady\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_396f615b-6e65-4443-b135-49b18a283e57/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/141868894.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"erping\",\"location\":\"private\"},{\"id\":\"usr_69f9c520-fa83-4165-8552-8d214b29e5bc\",\"username\":\"paridiso\",\"displayName\":\"PARIDISO\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_4664e2f6-4d7f-4b1e-8870-d762fabc10f6/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/4291687390.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\",\"system_trust_legend\"],\"developerType\":\"none\",\"status\":\"join me\",\"statusDescription\":\"Talk to me doc'\",\"location\":\"private\"},{\"id\":\"usr_6bcd069f-15ab-4a7b-995d-e7451c870fd8\",\"username\":\"krogenit\",\"displayName\":\"Krogenit\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_831a9d2e-eb05-47c0-812c-888e792196c9/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/3614741689.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\",\"system_trust_legend\"],\"developerType\":\"none\",\"status\":\"join me\",\"statusDescription\":\"dudosyat\",\"location\":\"wrld_d0b62423-fd59-48f7-9e4b-e6fece81b7ed:1\"},{\"id\":\"usr_64ffcd94-2224-4f10-81a6-f93796a2f83b\",\"username\":\"joker4455\",\"displayName\":\"Joker4455\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_e1d8d932-60b4-4630-aad0-3f663fd5ece9/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/407236284.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\",\"system_trust_legend\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"J&K <3\",\"location\":\"wrld_191cdb3d-a6ff-4677-9e83-7831a27807d6:87338~friends(usr_64ffcd94-2224-4f10-81a6-f93796a2f83b)~nonce(51300E9D70B0C2C074205528C075D9C0B33864A9E4E23FCFC4CD20CA05C2FF49)\"}]\n"));
		// sendGETRequest(formatURL("/auth/user/friends"), (data) => {
		// 	console.log(JSON.stringify(data));
		// 	callback(data);
		// 	cacheRequest("friends", data);
		// });
	}
}

/**
 * List own avatars
 * @param amount        How many avatars to get
 * @param offset        Offset
 * @param order         Sorting order
 * @param cached        Whether or not to only send a cached version
 * @param callback      Callback function
 */
function getAvatars(amount, offset, order, cached, callback) {
	const url = formatURL("/avatars") + "&user=me&releaseStatus=all&n=" + amount + "&offset=" + offset + "&sort=" + order + "&order=descending";
	if (cached) {
		callback(getCachedRequest("a:" + amount + "o:" + offset + "o:" + order + "_avatars"));
		return;
	}
	sendGETRequest(url, (data) => {
		callback(data);
		cacheRequest("a:" + amount + "o:" + offset + "o:" + order + "_avatars", data);
	});
}

/**
 * List own worlds
 * @param amount        How many worlds to get
 * @param order         Sorting order
 * @param cached        Whether or not to only send a cached version
 * @param callback      Callback function
 */
function getWorlds(amount, order, cached, callback) {
	if (cached) {
		callback(getCachedRequest("worlds"));
		return;
	}
	const url = formatURL("/worlds") + "&user=me&releaseStatus=all&n=" + amount + "&sort=" + order + "&order=descending";
	sendGETRequest(url, (data) => {
		callback(data);
		cacheRequest("worlds", data);
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
 * Modify avatar properties
 * @param id            ID of the avatar
 * @param settings      Settings to save
 * @param callback      Callback function
 */
function saveAvatar(id, settings, callback) {
	sendPUTRequest(formatURL("/avatars/" + id), settings, (data) => {
		callback(data);
	});
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
 * @param cacheonly     If only cached worlds should be returned
 * @param callback      Callback function
 */
function getWorld(id, cacheonly, callback) {
	for (let i = 0; i < worldCache.length; i++) {
		if (worldCache[i].id === id) {
			callback(worldCache[i]);
			return;
		}
	}

	if (cacheonly) {
		callback(null);
		return;
	}

	if (!isClientToken()) {
		console.log("Error! client token not set => {@see getWorld}");
		return
	}

	if (!isAuthToken()) {
		console.log("Error! auth token not set => {@see getWorld}");
		return
	}

	sendGETRequest(formatURL("/worlds/" + id), (data) => {
		const world = {
			id: data.id,
			name: data.name,
			image: data['thumbnailImageURL'],
			description: data.description,
			authorName: data.authorName,
			status: data['releaseStatus'],
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
 * @param cached        Whether or not to send a cached version of the world
 * @param callback      Callback function
 */
function getWorldMetadata(id, instance, cached, callback) {
	if (cached) {
		callback(getCachedRequest(instance));
	} else {
		sendGETRequest(formatURL("/worlds/" + id + "/" + instance), (data) => {
			callback(data);
			cacheRequest(instance, data);
		});
	}
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
 * @param {string} location         Target URL
 * @param {function} callback       Callback function
 * @param {string} [basic]          Basic auth if required
 */
function sendGETRequest(location, callback, basic) {
	const options = {
		host: base_url,
		path: "/api/1",
		port: 443,
		method: 'GET',
		headers: {
			"Content-Type": "application/json",
			"User-Agent" : "VRChatAppi (https://github.com/3e849f2e5c/VRChatAppi, v.1.1.1)"
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
			requestTotal++;
			callback(JSON.parse(data), resp.headers);
		});
		console.log("Request sent")
	}).on('error', err => {
		// TODO handle no network connection
		console.log(err);
	});
	request.end();
}

/**
 * Send a HTTP PUT request to the target URL
 * @param location          The target location
 * @param data              The data to send
 * @param callback          Callback function
 */
function sendPUTRequest(location, data, callback) {
	const options = {
		host: base_url,
		path: "/api/1",
		port: 443,
		method: 'PUT',
		headers: {
			"Content-Type": "application/json",
			"Content-Length": Buffer.byteLength(JSON.stringify(data)),
			"User-Agent" : "VRChatAppi (https://github.com/3e849f2e5c/VRChatAppi, v.1.1.1)"
		}
	};
	options.path += location;

	if (authToken !== '') {
		options.headers["Cookie"] = "auth=" + authToken;
	}

	const request = https.request(options, (resp) => {
		let data = '';
		resp.on('data', (chunk => {
			data += chunk;
		}));
		resp.on('end', () => {
			requestTotal++;
			callback(JSON.parse(data), resp.headers);
		});
		console.log("PUT Request sent")
	}).on('error', err => {
		// TODO handle no network connection
		console.log(err);
	});
	request.write(JSON.stringify(data));
	request.end();
}

/**
 * Parse auth token from HTTP cookies
 * @param headers   The HTTP request headers
 * @return {string} The authorization key
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

/**
 * Getter for {@see tags}
 * @return {{}}
 */
function getUserTags() {
	return tags;
}

/**
 * Get a request from the cache
 * @param ident         The requests identification
 * @returns {*}         The cached request
 */
function getCachedRequest(ident) {
	if (requestCache[ident] !== undefined) {
		return requestCache[ident]
	}
	return {};
}


/**
 * Store a request into the cache
 * @param ident         Identification for the request
 * @param data          The data to store
 */
function cacheRequest(ident, data) {
	requestCache[ident] = data;
}

/**
 * Export modules
 */
module.exports = {
	setClientToken: (callback) => {
		setClientToken(callback)
	},

	login: (name, password, callback) => {
		login(name, password, callback)
	},

	getFriends: (callback, cached) => {
		getFriends(callback, cached)
	},

	loadSession: (callback) => {
		loadSession(callback)
	},

	loadWorlds: () => {
		loadWorlds()
	},

	getWorld: (id, cacheonly, callback) => {
		getWorld(id, cacheonly, callback)
	},

	getLoginInfo: () => {
		return getLoginInfo();
	},

	getWorldMetadata: (id, instance, cached, callback) => {
		getWorldMetadata(id, instance, cached, callback)
	},

	modGetAgainstMe: (callback) => {
		modGetAgainstMe(callback)
	},

	modGetMine: (callback) => {
		modGetMine(callback)
	},

	getAvatars: (amount, offset, order, cached, callback) => {
		getAvatars(amount, offset, order, cached, callback)
	},

	getAvatar: (id, callback) => {
		getAvatar(id, callback)
	},

	getWorlds: (amount, order, cached, callback) => {
		getWorlds(amount, order, cached, callback)
	},
	getOwnWorld: (id, callback) => {
		getOwnWorld(id, callback)
	},

	logout: (callback) => {
		logout(callback);
	},

	clearCache: () => {
		clearCache();
	},

	loadSettings: () => (
		loadSettings()
	),

	saveSettings: (newSettings) => {
		saveSettings(newSettings)
	},

	getUserSettings: () => {
		return userSettings
	},

	getRequestAmount: () => {
		return requestTotal
	},

	saveAvatar: (id, settings, callback) => {
		saveAvatar(id, settings, callback);
	},
	
	getUserTags: () => {
		return getUserTags();
	}
};