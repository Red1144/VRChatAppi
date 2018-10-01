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
 * List of your favorites
 * @type {Array}
 */
let favorites = [];
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
 * Save favorites to a file
 * @param favorites
 */
function saveFavorites(favorites) {
	storage.set("favorites", {
		favorites: favorites
	}, (error) => {
		if (error) {
			console.log("Error: " + error);
		}
	});
}

/**
 * Load favorites from a file
 */
function loadFavorites(callback) {
	storage.has("favorites", (error, hasKey) => {
		if (hasKey) {
			storage.get("favorites", (error, data) => {
				favorites = data.favorites;
				callback(data.favorites);
			});
		} else {
			callback(null);
		}
	});
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
						id: i.loginInfo.id,
						loginPassword: i.loginInfo.password,
						loginName: i.loginInfo.loginName,
						friendGroups: i.loginInfo.friendGroups
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
				friendGroups: data.friendGroupNames
			};
			console.log(data);
			saveSession(() => {
				callback(data);
			});
		}
	}, (name + ":" + password));
}

/**
 * Get favorites
 * @param callback
 */
function getFavorites(callback) {
	sendGETRequest(formatURL("/favorites"), (data) => {
		callback(data);
	});
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
		// callback(JSON.parse("[{\"id\":\"usr_c24b36f4-6ebc-484c-bc2a-e8361ccb192a\",\"username\":\"annieurushihara\",\"displayName\":\"AnnieLeonhardt_\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_341ae5a9-e6f2-463e-a22a-57e5cd6296e5/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/4174957236.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"sonic is cute, change my mind\",\"location\":\"offline\"},{\"id\":\"usr_f2b15111-1efd-4003-bb05-c6c19075d606\",\"username\":\"kessy ^-^\",\"displayName\":\"KessY ^-^\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_79504828-70bb-443d-abab-cf67bcf510e1/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/3181921887.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_legend\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\",\"system_trust_basic\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"sleepy :P\",\"location\":\"offline\"},{\"id\":\"usr_df10637a-c9ae-4b4c-a9ec-41e8c9d1c442\",\"username\":\"kellz\",\"displayName\":\"kellz\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_501609ed-0f95-4ecc-a0cb-05a35041b058/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/1876841097.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_legend\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"state-0\",\"location\":\"offline\"},{\"id\":\"usr_ddbaa37e-a871-404e-ad61-32bfa6fbcff7\",\"username\":\"wings\",\"displayName\":\"Wings\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_b306eb0c-92c3-4813-a860-7ae4b70ce0b4/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/4244558639.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"gwapefwuit\",\"location\":\"offline\"},{\"id\":\"usr_9232cca6-b543-44dc-9a24-dd7519adb206\",\"username\":\"deathjaw1\",\"displayName\":\"Deathjaw derpy loli\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_0d285d58-c607-4354-84ff-1649219f1787/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/2480872613.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"derpy wants tp help.but......\",\"location\":\"offline\"},{\"id\":\"usr_a62eb7d6-a9f7-4175-bcc7-b38f201e5b70\",\"username\":\"mic_sounders\",\"displayName\":\"Mic_Sounders\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_cab2be17-2c43-4e35-b1bf-8cd339df71d1/2/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/4044463053.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Real \\\"We are all one Rank\\\" Hours\",\"location\":\"offline\"},{\"id\":\"usr_20f862e0-c011-4968-b944-6f4c70fcce5b\",\"username\":\"aunker\",\"displayName\":\"Aunker\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_96443605-4b93-4280-aae0-de1c16b364dc/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/2767567056.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"New CPU who dis\",\"location\":\"offline\"},{\"id\":\"usr_7f331834-424f-470d-9b89-532146b619e8\",\"username\":\"skelopex\",\"displayName\":\"Skelopex\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_4c7d9018-32b0-488c-bd9d-066b130edefe/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/2804059885.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_legend\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Taken\",\"location\":\"offline\"},{\"id\":\"usr_c170b82c-41f7-4b09-9569-9fa12d7bf564\",\"username\":\"zaxman\",\"displayName\":\"Zaxman\",\"currentAvatarImageUrl\":\"https://i.imgur.com/pcwll2i.png\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/3777323151.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"where the fuck is everyone\",\"location\":\"offline\"},{\"id\":\"usr_6bcd069f-15ab-4a7b-995d-e7451c870fd8\",\"username\":\"krogenit\",\"displayName\":\"Krogenit\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_831a9d2e-eb05-47c0-812c-888e792196c9/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/3614741689.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\",\"system_trust_legend\"],\"developerType\":\"none\",\"status\":\"join me\",\"statusDescription\":\"dudosyat\",\"location\":\"offline\"},{\"id\":\"usr_9769f752-4ee0-4c95-ae62-417ece3387b4\",\"username\":\"chrischiefxxx\",\"displayName\":\"chrischiefxxx\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_1f18a50c-b1d6-4aa1-ab08-0b6abaa3bfb3/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/154505827.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\",\"system_trust_legend\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"chilling\",\"location\":\"offline\"},{\"id\":\"usr_6d281397-aa35-4309-b031-b2be7f3065d5\",\"username\":\"kaunti\",\"displayName\":\"Kaunti\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_947e8f28-4262-47ca-8f37-cc0bb87fdfe3/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/419895517.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Islander of Texan Origin\",\"location\":\"offline\"},{\"id\":\"usr_58d14f73-7cfb-4a8a-8a9a-ca3ce067fbfa\",\"username\":\"lukasion\",\"displayName\":\"Lukasion\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_ee99ba64-bcb0-45a1-b2fd-54bd6140edde/16/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/1784199281.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Eat ass, smoke grass, sled fast\",\"location\":\"offline\"},{\"id\":\"usr_876dc950-5b57-4371-80aa-77e97b2b1e84\",\"username\":\"kantufla\",\"displayName\":\"Kantufla\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_86e435f7-baf0-4eec-977d-b9e9eae9b3c6/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/3875372957.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_legend\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"being wholesome <3\",\"location\":\"offline\"},{\"id\":\"usr_2bfda5a7-e006-42aa-842b-78d5fa7a3d2b\",\"username\":\"alphamakeswar\",\"displayName\":\"ALPHAMAKESWAR\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_f28b1c98-07a7-4aa2-993e-c77115eb9ab8/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/1296429153.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Cuddling\",\"location\":\"offline\"},{\"id\":\"usr_00dd7d20-6660-4373-8b5e-9109422adaf6\",\"username\":\"kingquest96\",\"displayName\":\"kingquest\",\"currentAvatarImageUrl\":\"https://pbs.twimg.com/media/DGGwqAPVwAAElpm.jpg\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/3897322897.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"hanging out with friends\",\"location\":\"offline\"},{\"id\":\"usr_ad34bdf9-5c37-4599-9212-00cc86db4bb3\",\"username\":\"tikibro\",\"displayName\":\"Tikibro\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_d2c5e422-04fa-4ef7-b3b7-19edce9edc13/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/416018548.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"join me\",\"statusDescription\":\"No Memes In General\",\"location\":\"offline\"},{\"id\":\"usr_d3bd1b64-d24d-4cde-ac80-c44f2e8e8a06\",\"username\":\"cakelover\",\"displayName\":\"Cakelover\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_9ef49e90-29a2-44d2-911e-a1bf1a9efe1b/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/3251238473.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"join me\",\"statusDescription\":\"Sweetish, lovely\",\"location\":\"offline\"},{\"id\":\"usr_69f9c520-fa83-4165-8552-8d214b29e5bc\",\"username\":\"paridiso\",\"displayName\":\"PARIDISO\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_4664e2f6-4d7f-4b1e-8870-d762fabc10f6/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/4291687390.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\",\"system_trust_legend\"],\"developerType\":\"none\",\"status\":\"busy\",\"statusDescription\":\"Overwhelmed\",\"location\":\"offline\"},{\"id\":\"usr_4b36d41f-f459-4762-848c-b53859ab0d81\",\"username\":\"akavana\",\"displayName\":\"Akavana\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_d832ea86-4e22-4463-8704-749867b4c2db/2/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/391002957.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_basic\",\"system_trust_veteran\",\"system_trust_legend\"],\"developerType\":\"none\",\"status\":\"join me\",\"statusDescription\":\"come\",\"location\":\"offline\"},{\"id\":\"usr_48bec295-0e10-48aa-acff-2d33ec4014b4\",\"username\":\"deanmclean\",\"displayName\":\"DeanMclean\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_0157b0d4-2ffa-4249-8676-b5b535f3b644/6/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/3762947466.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Lewding isnt bad x3\",\"location\":\"offline\"},{\"id\":\"usr_cc954e29-c1d4-4ff5-ace6-d15ad58f20f3\",\"username\":\"shimikaze-nu1\",\"displayName\":\"shimikaze-nu1\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_6915e6f1-516d-42a5-8456-aa5b24a98355/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/1320800342.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"a rude tech who loves ass\",\"location\":\"offline\"},{\"id\":\"usr_b3daec25-7b93-4ec8-a603-aa7730498539\",\"username\":\"_gnampf_\",\"displayName\":\"_gnampf_\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_5ecf625a-97db-43c6-a513-89ee1b46afd7/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/2847463886.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"join me\",\"statusDescription\":\"Anger and Hate are Supreme\",\"location\":\"offline\"},{\"id\":\"usr_67b146e9-1727-47a9-84ad-adba6921b1e9\",\"username\":\"kosblue\",\"displayName\":\"Kosblue\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_b7eb78aa-aac3-4b62-bc32-5bb742690652/3/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/2782131744.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\",\"system_trust_legend\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Ooof\",\"location\":\"offline\"},{\"id\":\"usr_cfb9bf78-ef70-4d16-a185-e500c48e4ec1\",\"username\":\"thedeadlybullet\",\"displayName\":\"TheDeadlyBullet\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_04b0bad3-dd42-49ac-b0e8-8d26e083ab5d/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/1631703907.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_veteran\",\"system_trust_trusted\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Country boiii...\",\"location\":\"offline\"},{\"id\":\"usr_8b09ed92-bebd-4719-97df-52b571ee53e7\",\"username\":\"vanilla neko\",\"displayName\":\"Vanilla Neko\",\"currentAvatarImageUrl\":\"https://i.imgur.com/ITMUI8s.jpg\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/1299126153.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\",\"system_trust_legend\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Plz give me cuddles and headpats\",\"location\":\"offline\"},{\"id\":\"usr_84d77202-2d92-4973-bec0-50ca2e8bd915\",\"username\":\"fakkufaku\",\"displayName\":\"FakkuFaku\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_57c36c34-43ed-4e1a-8807-61887d3e3916/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/3696417010.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_legend\",\"system_trust_known\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Eh...\",\"location\":\"offline\"},{\"id\":\"usr_0c9e292a-8274-472e-a586-881f2611539b\",\"username\":\"mayoi_chan\",\"displayName\":\"mayoi_chan\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_5dbbfbb7-8e39-4b62-af02-d2d5222c238b/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/1974622663.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"offline\"},{\"id\":\"usr_b1044cdf-ed90-4e32-8f44-cf096b702d54\",\"username\":\"tazor\",\"displayName\":\"Tazor\",\"currentAvatarImageUrl\":\"https://i.imgur.com/ncvyXaY.jpg\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/3548175807.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Proud son of Tikimum\",\"location\":\"offline\"},{\"id\":\"usr_e3119c4a-87df-49fd-a21a-bcf7cbc7a8da\",\"username\":\"nyashks\",\"displayName\":\"Nyashks\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_5ac1b1ac-311c-4afe-a4a8-e778e47e0610/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/1110879620.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Giving headpats\",\"location\":\"offline\"},{\"id\":\"usr_8ad9a49e-7c7f-4bfb-8beb-2a7cb861547c\",\"username\":\"socknboppers\",\"displayName\":\"Socknboppers\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_9d1e9ea3-feb7-43a3-a865-b00b90f81c5c/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/3398147616.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_basic\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Don't forget about me.\",\"location\":\"offline\"},{\"id\":\"usr_0616aa09-fc04-4099-9c99-6b3a3e219da3\",\"username\":\"lush fox\",\"displayName\":\"Lush Fox\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_cc735257-bdf0-4a8c-bb1f-af2a41f9046a/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/551126833.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Beauty in the eyes of holder\",\"location\":\"offline\"},{\"id\":\"usr_8e804cd9-6f53-4831-a6eb-02fa4383ccae\",\"username\":\"meld\",\"displayName\":\"Meld\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_7b32606c-61d9-4dd6-a771-d5c9a112c97c/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/3871984994.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"offline\"},{\"id\":\"usr_c651ccb1-eedf-48d9-925f-ccdea6669a30\",\"username\":\"sc00p\",\"displayName\":\"Sc00p\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_20b7185c-0c91-4849-8ab0-80716497c40c/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/4155651690.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_basic\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"GOBLINS?\",\"location\":\"offline\"},{\"id\":\"usr_fe711b56-c20c-49d1-8551-6739dfee4bae\",\"username\":\"dmeggs\",\"displayName\":\"DMEggs\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_20ebb511-2a83-4c76-98bd-9a4a02a657cf/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/4159074155.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\"],\"developerType\":\"none\",\"status\":\"join me\",\"statusDescription\":\"O*O\",\"location\":\"offline\"},{\"id\":\"usr_4600f7a0-0780-4702-9dd8-7d5e0e0fe70f\",\"username\":\"kittlykatt\",\"displayName\":\"KittlyKatt\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_b8a7e9e8-28a2-46b1-a20c-ee98b9269aca/3/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/1199435976.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"offline\"},{\"id\":\"UcmV5nZNs3\",\"username\":\"owlboy\",\"displayName\":\"owlboy\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_cf96acf7-65d6-4e77-b997-42c446251ea5/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/1006622099.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_legend\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\",\"system_trust_legend\",\"system_trust_veteran\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"hoot\",\"location\":\"offline\"},{\"id\":\"usr_6f0b12ce-8d8a-402d-bdb8-8d8b367874c4\",\"username\":\"lowe\",\"displayName\":\"Lowe\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_186581f8-9378-48eb-ba0e-42b75816f51a/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/1516009088.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Drinking + Smoking=bad /shrug\",\"location\":\"offline\"},{\"id\":\"usr_fa972597-9276-47c5-a710-0d811d4f7176\",\"username\":\"lilroy\",\"displayName\":\"LilRoy\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_321f5009-7926-4a9b-95e0-f47bfc7bee11/2/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/1470717477.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"Hello Me Desktop User\",\"location\":\"offline\"},{\"id\":\"usr_3a806511-957b-44a1-a769-cb6f3bc6cb35\",\"username\":\"3e849f2e5c\",\"displayName\":\"Aneko\",\"currentAvatarImageUrl\":\"https://s3-us-west-2.amazonaws.com/vrc-uploads/images/image_1200x900_2016-11-29_21-44-18.png\",\"currentAvatarThumbnailImageUrl\":\"https://s3-us-west-2.amazonaws.com/vrc-uploads/thumbnails/1010283528.thumbnail-200.png\",\"tags\":[],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"offline\"},{\"id\":\"usr_a7b9c39d-afa1-411d-8734-3df1a956ca0f\",\"username\":\"anker221\",\"displayName\":\"Anker221\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_197d9377-9058-4fb2-afe1-090c9927a418/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/2431596344.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_trusted\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"offline\"},{\"id\":\"usr_640a9640-5bc7-4c16-9b8e-73d5ce6e36d3\",\"username\":\"blastufat\",\"displayName\":\"Blastufat\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_b56d54d4-0a99-402f-839b-c99d57b29dc6/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/2798094896.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_known\",\"system_feedback_access\",\"system_trust_known\",\"system_feedback_access\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"offline\"},{\"id\":\"usr_c11c5549-5dc7-4386-86e3-3426a1992c38\",\"username\":\"broombot\",\"displayName\":\"BroomBot\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_d7216804-307e-4f5d-bd2d-c01669955ec7/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/3002320923.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_known\",\"system_feedback_access\",\"system_trust_basic\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"offline\"},{\"id\":\"usr_84867962-b784-43f3-99ed-018a13fbfa29\",\"username\":\"s script\",\"displayName\":\"s script\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_b5db4ea7-7a60-494b-8e51-87345f33450e/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://d348imysud55la.cloudfront.net/thumbnails/2672573164.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\",\"system_trust_known\",\"system_trust_known\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"offline\"},{\"id\":\"usr_3185aa2e-f940-4d38-9a2c-edafbef7239b\",\"username\":\"gamma\",\"displayName\":\"Gamma\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_f84b8b76-499d-46ae-a341-c57fa8199e9d/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/2427684461.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\",\"system_trust_basic\",\"system_trust_intermediate\",\"system_feedback_access\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"offline\"},{\"id\":\"usr_a50053eb-0b7e-4a30-bb69-2eb35506bfe1\",\"username\":\"trippey\",\"displayName\":\"Trippey\",\"currentAvatarImageUrl\":\"https://api.vrchat.cloud/api/1/file/file_d81c4534-15b8-4d46-a449-feaaf24e0199/1/file\",\"currentAvatarThumbnailImageUrl\":\"https://files.vrchat.cloud/thumbnails/22270358.thumbnail-500.png\",\"tags\":[\"system_avatar_access\",\"system_world_access\"],\"developerType\":\"none\",\"status\":\"active\",\"statusDescription\":\"\",\"location\":\"offline\"}]\n"));
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
	},
	
	saveFavorites: (favorites) => {
		saveFavorites(favorites);
	},
	
	loadFavorites: (callback) => {
		loadFavorites(callback);
	},
	
	getFavorites: (callback) => {
		getFavorites(callback);
	}
};