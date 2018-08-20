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
			loginInfo = {
				username: data.username,
				displayName: data.displayName,
				avatarImage: data['currentAvatarThumbnailImageUrl'],
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
		return
	}

	if (!isAuthToken()) {
		console.log("Error! auth token not set => {@see getFriends}");
		return
	}
	if (cached) {
		callback(getCachedRequest("friends"));
	} else {
		sendGETRequest(formatURL("/auth/user/friends"), (data) => {
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
 * @param cached        Whether or not to only send a cached version
 * @param callback      Callback function
 */
function getAvatars(amount, offset, order, cached, callback) {
	const url = formatURL("/avatars") + "&user=me&releaseStatus=all&n=" + amount + "&offset=" + offset + "&sort=" + order + "&order=descending";
	if (cached) {
		callback(getCachedRequest("a:" + amount + "o:" + offset + "o:" + order + "_avatars"));
		return;
	}
	/*callback(JSON.parse("[{\"id\":\"avtr_89062699-6919-4997-8426-649a59f7c254\",\"name\":\"test edit\",\"description\":\"asd\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"http://dbinj8iahsbec.cloudfront.net/avatars/new_556450_1_5.6.3p1_1_standalonewindows_release.vrca\",\"imageUrl\":\"https://i.imgur.com/DbwSbsA.png\",\"thumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/3755569083.thumbnail-500.png\",\"releaseStatus\":\"public\",\"version\":4,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_ee8fb495-3c96-441d-8f34-900e96643ce1\",\"assetUrl\":\"http://dbinj8iahsbec.cloudfront.net/avatars/new_556450_1_5.6.3p1_1_standalonewindows_release.vrca\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_92f94cd6-b9d2-494a-b5cb-d06c5f5da5f8\",\"name\":\"Blind\",\"description\":\"hard test\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"3e849f2e5c\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_f7a97356-99e6-4047-9959-61d8e6938ab1/3/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_bf6296ce-52c9-4c4c-a025-5ae808611a8f/1/file\",\"thumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/1989460361.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_2b1f5908-eefe-47e7-b994-f9137730f81c\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_f7a97356-99e6-4047-9959-61d8e6938ab1/3/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\",\"created_at\":\"2018-08-18T12:57:07.588Z\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_0719d672-7d20-4186-b056-1862aade2717\",\"name\":\"projectortest\",\"description\":\"projectortest\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"3e849f2e5c\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_991218e9-0397-453f-8251-c0b10f60f73c/1/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_6b86cb8c-ba6d-4ae8-9df4-c67ee8e1fe6f/1/file\",\"thumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/2422225281.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_bea4ac8a-f15f-4297-825f-1138105b8a7a\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_991218e9-0397-453f-8251-c0b10f60f73c/1/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_95ae0847-b880-491a-8505-48077adf2ad3\",\"name\":\"OwlJustice\",\"description\":\"OwlJustice\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"3e849f2e5c\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_035e94e1-b84e-4012-ad65-ee63a061ef04/1/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_46bbf991-0aa2-4c10-ad2b-cb421ad78d7d/1/file\",\"thumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/3718618561.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_e28c4777-c531-4f82-8e3d-e3c17586cd2c\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_035e94e1-b84e-4012-ad65-ee63a061ef04/1/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_abfdd974-73ba-4f55-a318-c6bf5527e3db\",\"name\":\"Konko Desktop\",\"description\":\"Konko Desktop\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_dca9014d-60c0-46d5-97ae-447f18d612b5/1/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_1017ff33-cbc5-4e98-8ed6-cc175402ed75/1/file\",\"thumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/3615299912.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_21176e81-7533-46bb-9fde-d8ed31386422\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_dca9014d-60c0-46d5-97ae-447f18d612b5/1/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_764adf6a-7db3-4500-b1a8-d6e38491b717\",\"name\":\"Invis\",\"description\":\"Invis\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_f1671457-7abd-459d-91c8-224856f4b132/1/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_20146e8b-3cbd-4f2d-98ac-82fd03ebe515/1/file\",\"thumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/1326179176.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_dfa79ae0-71e8-4271-908d-cb4e083668df\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_f1671457-7abd-459d-91c8-224856f4b132/1/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_542963ed-6e31-46fe-88cd-ae0b6c79f944\",\"name\":\"Konko Clout\",\"description\":\"Konko Clout\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_23f99cd5-781f-451a-843f-c1f6692f683f/19/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_d14d0959-69ab-4f62-890e-36834f99596c/1/file\",\"thumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/1140388657.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_9218a664-df7b-4b27-8d9f-fdc1f5f8662c\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_23f99cd5-781f-451a-843f-c1f6692f683f/19/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\",\"created_at\":\"2018-07-04T17:45:49.384Z\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_184845d7-2ac2-4424-a727-48f3e09cf7be\",\"name\":\"Konko Clout Anim\",\"description\":\"Konko Clout Anim\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_a958b980-c8a0-4974-a55a-8e37b8e94330/7/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_de1ed2e8-c17a-4569-9f95-022c82956076/1/file\",\"thumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/1302596131.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_26d6d4f6-3ab1-4062-9383-46d3219f5848\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_a958b980-c8a0-4974-a55a-8e37b8e94330/7/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\",\"created_at\":\"2018-07-02T13:55:11.643Z\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_431c8873-09e3-434a-ae34-580d7a18a273\",\"name\":\"Konko Gun\",\"description\":\"Konko Gun\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_e77a3dd3-e913-4804-b7dc-ef79272c65a5/6/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_78ee2a8b-9519-4bb0-a64e-2fc894611816/1/file\",\"thumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/2004471348.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_49b6c360-8d9e-42d2-88fd-c54adf162216\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_e77a3dd3-e913-4804-b7dc-ef79272c65a5/6/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\",\"created_at\":\"2018-06-30T21:04:33.579Z\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_cad451ad-9634-497f-852d-f01a3acef6d3\",\"name\":\"Stand\",\"description\":\"Stand\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_d59cae69-516c-441a-8533-311462d9ddf4/7/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_f41db082-f781-42aa-88fa-c2262458fff1/1/file\",\"thumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/1400821753.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_268eb39e-d3a8-42f5-8c0b-86ec870ade4d\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_d59cae69-516c-441a-8533-311462d9ddf4/7/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\",\"created_at\":\"2018-06-27T22:34:50.679Z\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_fce8e0ab-9f2f-4be5-9d96-ce50e9316771\",\"name\":\"Booster Seat\",\"description\":\"Booster Seat\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_47d09e36-0caa-41d6-9291-d30d0b32090a/1/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_949f9d86-3199-4a45-a9af-2b43d4a72216/1/file\",\"thumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/1143760830.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_6ff17f1b-f579-4288-8dcf-3de840805e70\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_47d09e36-0caa-41d6-9291-d30d0b32090a/1/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_1199ac70-9525-4899-9970-456bdc63ec6b\",\"name\":\"illegal\",\"description\":\"illegal\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_b39df00f-afdc-4886-a5aa-bf2920af8652/2/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_28a1182e-ff59-4993-bdf5-0d72c8973f1f/1/file\",\"thumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/1283317573.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_f03639b8-c3e4-4f15-b30b-d77f286bd1be\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_b39df00f-afdc-4886-a5aa-bf2920af8652/2/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\",\"created_at\":\"2018-06-24T22:41:52.009Z\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_e01eb122-10ea-4975-9c18-8348bc14d3ba\",\"name\":\"GPU Crash\",\"description\":\"GPU Crash\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_fe29223b-3cb6-459c-a5c8-68c40d66f7ab/1/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_f87396da-3b18-42a8-b354-5a764d39a23e/1/file\",\"thumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/2360962496.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_e0f75bcc-e04c-46e2-b405-bd9cdd0ff9eb\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_fe29223b-3cb6-459c-a5c8-68c40d66f7ab/1/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_cf05f792-4a41-40e4-96f5-a46ad3ae741b\",\"name\":\"Konko Square Up\",\"description\":\"Konko Square Up\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_61e5ee6f-90e0-4ca8-b53c-40dc9ae55c24/6/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_3e2b8dba-3d84-408a-a419-5f21f60d5cec/1/file\",\"thumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/1067253940.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_813d39b0-403c-4953-bfe5-eaf3fb5c6a2b\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_61e5ee6f-90e0-4ca8-b53c-40dc9ae55c24/6/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\",\"created_at\":\"2018-06-23T03:32:57.273Z\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_99b7faab-fbcb-403d-b701-c3bf903f1a16\",\"name\":\"Konko Cancer\",\"description\":\"Konko Cancer\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_effe4861-c2f7-4042-a23a-c1926c499f6b/1/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_b61d34ea-59c3-4ac0-b80a-ca016f947a92/1/file\",\"thumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/1526564104.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_5188a621-085f-4bc4-a40d-a5570d3c1b9b\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_effe4861-c2f7-4042-a23a-c1926c499f6b/1/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_02cdc1a2-8d93-4b70-90a3-af96bdf2eab7\",\"name\":\"KonkoKawaii\",\"description\":\"KonkoKawaii\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_cd176bf9-fb5c-49de-b6d7-62a920b4c820/14/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_02311822-cd61-4e9a-adc4-d02ae8b1f9d9/2/file\",\"thumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/1687925164.thumbnail-500.png\",\"releaseStatus\":\"public\",\"version\":2,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_8a07cba4-0941-4019-ade4-5e742f8c2afe\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_cd176bf9-fb5c-49de-b6d7-62a920b4c820/14/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\",\"created_at\":\"2018-06-22T18:01:15.800Z\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_380008cd-99b0-43ba-b4c0-73e102eaac5e\",\"name\":\"Grass\",\"description\":\"Grass\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_cba08561-9623-4cf3-93ff-1ecb95eee7e3/1/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_c5e82316-c5af-4b68-9bbd-9b3da81b1771/1/file\",\"thumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/2158918811.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_93c7a16a-8fa0-4a6e-9170-98bdc6d8de21\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_cba08561-9623-4cf3-93ff-1ecb95eee7e3/1/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_488f0f91-603f-4613-a1a4-fd16cf53b82b\",\"name\":\"Konko WIP 2\",\"description\":\"Konko WIP 2\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_c9bf9289-b325-47a5-8668-c201f98c3e30/6/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_5bf24d3a-9faa-49c7-8953-91f9f6a1d266/2/file\",\"thumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/2864741283.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_bf616907-ba9b-446a-9af6-1482d14f179f\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_c9bf9289-b325-47a5-8668-c201f98c3e30/6/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\",\"created_at\":\"2018-06-12T13:23:34.182Z\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_60981a88-df6d-4e73-8000-c2ce62c2aa4b\",\"name\":\"Konko WIP\",\"description\":\"Konko WIP\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_7d486330-1533-466a-b2aa-26a889098448/1/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_134786b9-467f-4366-8bbb-98fc23c3559b/1/file\",\"thumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/401930708.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_ca0f1e32-b9bc-4a2b-8d80-ef612504bee9\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_7d486330-1533-466a-b2aa-26a889098448/1/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"},{\"id\":\"avtr_4946aa0e-61a8-448d-80ec-1b10607628f5\",\"name\":\"Pikafix New\",\"description\":\"Pikafix Desktop\",\"authorId\":\"usr_67f35975-c234-43a3-b795-64c498cd82b0\",\"authorName\":\"Aneko\",\"tags\":[],\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_c416e834-c469-4aee-9076-4aa0ff886d6b/13/file\",\"imageUrl\":\"https://api.vrchat.cloud/api/1/file/file_2c1d5cd7-6523-463a-b796-00737bdc3f5e/1/file\",\"thumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/2914013574.thumbnail-500.png\",\"releaseStatus\":\"private\",\"version\":1,\"featured\":false,\"unityPackages\":[{\"id\":\"unp_3ff28c77-1898-48f0-b581-19857d4a9d94\",\"assetUrl\":\"https://api.vrchat.cloud/api/1/file/file_c416e834-c469-4aee-9076-4aa0ff886d6b/13/file\",\"unityVersion\":\"5.6.3p1\",\"unitySortNumber\":50603010,\"assetVersion\":1,\"platform\":\"standalonewindows\",\"created_at\":\"2018-06-09T17:44:35.608Z\"}],\"unityPackageUpdated\":false,\"unityPackageUrl\":\"\"}]\n"));
	return;*/
	sendGETRequest(url, (data) => {
		console.log(JSON.stringify(data));
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
			"Content-Length": Buffer.byteLength(JSON.stringify(data))
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
	}
};