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
	console.log("true");
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
 * @param {function} callback   The callback function
 * @param {boolean} cached      Whether or not to send a cached version of the friends list
 */
function getFriends(callback, cached) {
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
	if (cached) {
		console.log("cached");
		callback(getCachedRequest("friends"));
	} else {
		console.log("live");
		const data = "[{\"id\":\"usr_a62eb7d6-a9f7-4175-bcc7-b38f201e5b70\",\"username\":\"mic_sounders\",\"displayName\":\"Mic_Sounders\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_eccc0111-85ad-434c-aa75-c789f55519c7/2/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/3880886158.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"wrld_96d4bcca-1177-45a9-8112-2dda6e043b74:45621~hidden(usr_20e01578-5738-4332-84d7-d910c9977e8e)~nonce(754C2810FFEFF431809E164BE2B23808D2E5F8DD8912C2E997FC4612A53B2764)\"},{\"id\":\"usr_7f331834-424f-470d-9b89-532146b619e8\",\"username\":\"skelopex\",\"displayName\":\"Skelopex\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_73dc209c-892b-4448-a7fd-b591a409f3e8/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/2204234371.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_legend\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"wrld_191cdb3d-a6ff-4677-9e83-7831a27807d6:8019~hidden(usr_0d38fe2b-310c-4d6e-b549-aa7bb58961bf)~nonce(4A3D06DCD7092C079BD60FD450F3F1901393CD6B1BAFD28B89CB71575FADE4B5)\"},{\"id\":\"usr_7cbfaf98-bbb7-49bb-b2fb-64aea29f0802\",\"username\":\"riff\",\"displayName\":\"Riff\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_f7aeaf5c-efd5-44bb-926d-d8807c4d570e/3/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/2935654067.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"wrld_191cdb3d-a6ff-4677-9e83-7831a27807d6:57754~hidden(usr_a8e70155-0fd3-4760-bd11-2619f80cb51a)~nonce(7DD9963E4A5EE8C0433852D5FC05FF18231CD1FDA6C2ED5A5B7910E6A2C42A24)\"},{\"id\":\"usr_12df07a7-f3e5-4019-9360-80dc66a81a46\",\"username\":\"khloe\",\"displayName\":\"Khloe\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_e9b96338-7ec4-4df3-a45e-10e49b080e0f/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/234808660.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"wrld_191cdb3d-a6ff-4677-9e83-7831a27807d6:57754~hidden(usr_a8e70155-0fd3-4760-bd11-2619f80cb51a)~nonce(7DD9963E4A5EE8C0433852D5FC05FF18231CD1FDA6C2ED5A5B7910E6A2C42A24)\"},{\"id\":\"usr_8ad9a49e-7c7f-4bfb-8beb-2a7cb861547c\",\"username\":\"socknboppers\",\"displayName\":\"Socknboppers\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_31786a61-feae-4063-8060-0d62bd86aec5/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/3972384643.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_basic\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"wrld_191cdb3d-a6ff-4677-9e83-7831a27807d6:57754~hidden(usr_a8e70155-0fd3-4760-bd11-2619f80cb51a)~nonce(7DD9963E4A5EE8C0433852D5FC05FF18231CD1FDA6C2ED5A5B7910E6A2C42A24)\"},{\"id\":\"usr_69f9c520-fa83-4165-8552-8d214b29e5bc\",\"username\":\"paridiso\",\"displayName\":\"PARIDISO\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_7f602c02-6cca-4b7d-85ac-aed75a2d65fa/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/4265696968.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"admin_avatar_access\",\"admin_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"private\"},{\"id\":\"usr_0c9e292a-8274-472e-a586-881f2611539b\",\"username\":\"mayoi_chan\",\"displayName\":\"mayoi_chan\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_0565434e-bb38-49f7-9df8-222eb2d0e038/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/2770499986.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"wrld_b268b844-c56f-42c5-9199-94d809622f84:20215\"},{\"id\":\"usr_df10637a-c9ae-4b4c-a9ec-41e8c9d1c442\",\"username\":\"kellz\",\"displayName\":\"kellz\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_fe6ad8c7-9c86-4f26-b26b-9258d13a99a2/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_fe6ad8c7-9c86-4f26-b26b-9258d13a99a2/1/file\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_legend\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"wrld_191cdb3d-a6ff-4677-9e83-7831a27807d6:57754~hidden(usr_a8e70155-0fd3-4760-bd11-2619f80cb51a)~nonce(7DD9963E4A5EE8C0433852D5FC05FF18231CD1FDA6C2ED5A5B7910E6A2C42A24)\"},{\"id\":\"usr_c170b82c-41f7-4b09-9569-9fa12d7bf564\",\"username\":\"zaxman\",\"displayName\":\"Zaxman\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_8b9a7d00-274c-4928-a333-e70dbdaa8019/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/3083235177.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"wrld_191cdb3d-a6ff-4677-9e83-7831a27807d6:57754~hidden(usr_a8e70155-0fd3-4760-bd11-2619f80cb51a)~nonce(7DD9963E4A5EE8C0433852D5FC05FF18231CD1FDA6C2ED5A5B7910E6A2C42A24)\"},{\"id\":\"usr_2d804725-e660-4dbd-ba5c-893c3ac1f09b\",\"username\":\"kaoura\",\"displayName\":\"Kaoura\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_26884591-0432-4cbd-af90-6555157ebd52/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/3407579741.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_legend\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"private\"},{\"id\":\"usr_64ffcd94-2224-4f10-81a6-f93796a2f83b\",\"username\":\"joker4455\",\"displayName\":\"Joker4455\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_c3a63e30-ec73-4367-a363-83cffe1520ec/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/958055151.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"wrld_191cdb3d-a6ff-4677-9e83-7831a27807d6:28856~friends(usr_64ffcd94-2224-4f10-81a6-f93796a2f83b)~nonce(F2BAAAA1BCD04A2BA92AD5FA2F6C4BC40916F4F3D82AF2356274EC1AC48C9F31)\"},{\"id\":\"usr_fd6213ba-33a9-4015-ab78-f8da8c087c99\",\"username\":\"sabit\",\"displayName\":\"Sabit\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_5ca0bb17-1a48-46d2-9464-4c311d4742d1/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/541207707.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_legend\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"wrld_58af7ad6-15c9-49e0-b8d1-452b54aec93e:32176~hidden(usr_27a7ff83-0cf0-40cf-ad61-92e67f5c0cdf)~nonce(0068CF94295C2BFD69DA6D842697AF2164052173DE4EF186309B709339ABC4D9)\"},{\"id\":\"usr_876dc950-5b57-4371-80aa-77e97b2b1e84\",\"username\":\"kantufla\",\"displayName\":\"Kantufla\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_501bd4b2-bc55-4da8-98c5-cf285d11aeb9/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/877854847.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_legend\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"private\"},{\"id\":\"usr_f2b15111-1efd-4003-bb05-c6c19075d606\",\"username\":\"kessy ^-^\",\"displayName\":\"KessY ^-^\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_388bb579-67fe-435f-9759-60429b8abea9/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/3287417433.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_legend\",\"system_trust_basic\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"private\"},{\"id\":\"usr_f9089220-a18b-43a4-8263-baf568d919d6\",\"username\":\"oknuj\",\"displayName\":\"oknuj\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_6c15bd73-eb9a-4a64-9155-605bd35f572d/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/964000032.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"admin_avatar_access\",\"admin_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"private\"}]\n";
		callback(JSON.parse(data));
		cacheRequest("friends", JSON.parse(data));
		return;
		sendGETRequest(formatURL("/auth/user/friends"), (data) => {
			console.log(JSON.stringify(data));
			callback(data);
			cacheRequest("friends", data);
		});
	}


}

/**
 * List own avatars
 * @param amount        How many avatars to get
 * @param offset        Offset
 * @param order         Sorting order
 * @param callback      Callback function
 */
function getAvatars(amount, offset, order, callback) {
	const url = formatURL("/avatars") + "&user=me&releaseStatus=all&n=" + amount + "&offset=" + offset + "&sort=" + order + "&order=descending";
	callback(JSON.parse("[{\"id\":\"avtr_95ae0847-b880-491a-8505-48077adf2ad3\",\"name\":\"OwlJustice\",\"description\":\"OwlJustice\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"3e849f2e5c\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_035e94e1-b84e-4012-ad65-ee63a061ef04/1/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_46bbf991-0aa2-4c10-ad2b-cb421ad78d7d/1/file\",\"thumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/3718618561.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_e28c4777-c531-4f82-8e3d-e3c17586cd2c\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_035e94e1-b84e-4012-ad65-ee63a061ef04/1/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_abfdd974-73ba-4f55-a318-c6bf5527e3db\",\"name\":\"Konko Desktop\",\"description\":\"Konko Desktop\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_dca9014d-60c0-46d5-97ae-447f18d612b5/1/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_1017ff33-cbc5-4e98-8ed6-cc175402ed75/1/file\",\"thumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/3615299912.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_21176e81-7533-46bb-9fde-d8ed31386422\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_dca9014d-60c0-46d5-97ae-447f18d612b5/1/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_764adf6a-7db3-4500-b1a8-d6e38491b717\",\"name\":\"Invis\",\"description\":\"Invis\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_f1671457-7abd-459d-91c8-224856f4b132/1/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_20146e8b-3cbd-4f2d-98ac-82fd03ebe515/1/file\",\"thumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/1326179176.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_dfa79ae0-71e8-4271-908d-cb4e083668df\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_f1671457-7abd-459d-91c8-224856f4b132/1/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_542963ed-6e31-46fe-88cd-ae0b6c79f944\",\"name\":\"Konko Clout\",\"description\":\"Konko Clout\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_23f99cd5-781f-451a-843f-c1f6692f683f/19/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_d14d0959-69ab-4f62-890e-36834f99596c/1/file\",\"thumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/1140388657.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_9218a664-df7b-4b27-8d9f-fdc1f5f8662c\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_23f99cd5-781f-451a-843f-c1f6692f683f/19/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\",\"created_at\":\"2018-07-04T17:45:49.384Z\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_184845d7-2ac2-4424-a727-48f3e09cf7be\",\"name\":\"Konko Clout Anim\",\"description\":\"Konko Clout Anim\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_a958b980-c8a0-4974-a55a-8e37b8e94330/7/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_de1ed2e8-c17a-4569-9f95-022c82956076/1/file\",\"thumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/1302596131.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_26d6d4f6-3ab1-4062-9383-46d3219f5848\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_a958b980-c8a0-4974-a55a-8e37b8e94330/7/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\",\"created_at\":\"2018-07-02T13:55:11.643Z\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_431c8873-09e3-434a-ae34-580d7a18a273\",\"name\":\"Konko Gun\",\"description\":\"Konko Gun\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_e77a3dd3-e913-4804-b7dc-ef79272c65a5/6/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_78ee2a8b-9519-4bb0-a64e-2fc894611816/1/file\",\"thumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/2004471348.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_49b6c360-8d9e-42d2-88fd-c54adf162216\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_e77a3dd3-e913-4804-b7dc-ef79272c65a5/6/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\",\"created_at\":\"2018-06-30T21:04:33.579Z\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_cad451ad-9634-497f-852d-f01a3acef6d3\",\"name\":\"Stand\",\"description\":\"Stand\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_d59cae69-516c-441a-8533-311462d9ddf4/7/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_f41db082-f781-42aa-88fa-c2262458fff1/1/file\",\"thumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/1400821753.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_268eb39e-d3a8-42f5-8c0b-86ec870ade4d\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_d59cae69-516c-441a-8533-311462d9ddf4/7/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\",\"created_at\":\"2018-06-27T22:34:50.679Z\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_fce8e0ab-9f2f-4be5-9d96-ce50e9316771\",\"name\":\"Booster Seat\",\"description\":\"Booster Seat\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_47d09e36-0caa-41d6-9291-d30d0b32090a/1/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_949f9d86-3199-4a45-a9af-2b43d4a72216/1/file\",\"thumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/1143760830.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_6ff17f1b-f579-4288-8dcf-3de840805e70\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_47d09e36-0caa-41d6-9291-d30d0b32090a/1/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_1199ac70-9525-4899-9970-456bdc63ec6b\",\"name\":\"illegal\",\"description\":\"illegal\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_b39df00f-afdc-4886-a5aa-bf2920af8652/2/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_28a1182e-ff59-4993-bdf5-0d72c8973f1f/1/file\",\"thumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/1283317573.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_f03639b8-c3e4-4f15-b30b-d77f286bd1be\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_b39df00f-afdc-4886-a5aa-bf2920af8652/2/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\",\"created_at\":\"2018-06-24T22:41:52.009Z\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_e01eb122-10ea-4975-9c18-8348bc14d3ba\",\"name\":\"GPU Crash\",\"description\":\"GPU Crash\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_fe29223b-3cb6-459c-a5c8-68c40d66f7ab/1/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_f87396da-3b18-42a8-b354-5a764d39a23e/1/file\",\"thumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/2360962496.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_e0f75bcc-e04c-46e2-b405-bd9cdd0ff9eb\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_fe29223b-3cb6-459c-a5c8-68c40d66f7ab/1/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"}]\n"))
	return;
	sendGETRequest(url, (data) => {
		callback(data);
	})
}

/**
 * List own worlds
 * @param amount        How many worlds to get
 * @param order         Sorting order
 * @param callback      Callback function
 */
function getWorlds(amount, order, callback) {
	const url = formatURL("/worlds") + "&user=me&releaseStatus=all&n=" + amount + "&sort=" + order + "&order=descending";
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
 * @param cached        Whether or not to send a cached version of the world
 * @param callback      Callback function
 */
function getWorldMetadata(id, instance, cached, callback) {
	if (cached) {
		console.log("cached");
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
 * @param {string} location          Target URL
 * @param {function} callback  Callback function
 * @param {string} [basic]      Basic auth if required
 */

function sendGETRequest(location, callback, basic) {
	/*callback("{}");
	return;*/
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

/**
 * Get a request from the cache
 * @param ident         The requests identification
 * @returns {*}         The cached request
 */
function getCachedRequest(ident) {
	if (requestCache[ident] !== undefined) {
		return requestCache[ident]
	}
	console.log("what");
	console.log(requestCache);
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

	getAvatars: (amount, offset, order, callback) => {
		getAvatars(amount, offset, order, callback)
	},

	getAvatar: (id, callback) => {
		getAvatar(id, callback)
	},

	getWorlds: (amount, order, callback) => {
		getWorlds(amount, order, callback)
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
	}
};