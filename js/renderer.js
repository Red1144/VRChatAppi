// This file is required by the app.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
const {remote} = require('electron');
const api = remote.require('./vrchat-api.js');
const main = remote.require('./main.js');
const content = document.getElementById("content-area");
const loading = document.getElementById("loading");

const popupContainer = document.getElementById("popup-container");
const popup = document.getElementById("popup");

let loadingAvatars = false;
let avatarPage = 0;

/**
 * Navigation bar functions
 */
function closeNav() {
	document.getElementById("mySidenav").style.width = "0";
}

const navMe = document.getElementById("me");
navMe.addEventListener("click", () => {
	buildMePage(content);
	closeNav();
});
const navFriends = document.getElementById("friends");
navFriends.addEventListener("click", () => {
	buildFriendsPage(content);
	closeNav();
});
const navAvatars = document.getElementById("avatars");
navAvatars.addEventListener("click", () => {
	loadingAvatars = false;
	avatarPage = 0;
	buildAvatarsPage(content, 0);
	closeNav();
});
const navWorlds = document.getElementById("worlds");
navWorlds.addEventListener("click", () => {
	buildWorldsPage(content);
	closeNav();
});
const navModeration = document.getElementById("moderation");
navModeration.addEventListener("click", () => {
	buildModerationsPage(content);
	closeNav();
});
const navLogout = document.getElementById("logout");
navLogout.addEventListener("click", () => {
	logout();
	closeNav();
});

/**
 * Logs you out of the app
 */
function logout() {
	startLoading();
	api.logout(() => {
		document.location = "login.html"
	});
}


/**
 * Notifaction function
 * @param message {string}      message to send in the notification
 * @param type {string}         notification type, alert-ok or alert-error
 */
function sendNotification(message, type) {
	const area = document.getElementById("notification-area");
	const notification = createElement("div", "notification " + type);
	const msg = createElement("a", "", message);
	notification.appendChild(msg);
	area.appendChild(notification);
	notification.addEventListener("click", () => {
		area.removeChild(notification);
	});
	setTimeout(() => {
		if (area.contains(notification)) {
			area.removeChild(notification);
		}
	}, 5000);
}

/**
 * Loading status popup functions
 */

function startLoading() {
	loading.style.opacity = "1";
}

function stopLoading() {
	loading.style.opacity = "0";
}

/**
 * Popup functions
 */

function setPopup(content) {
	//window.scrollTo(0, 0);
	//document.body.style.overflow = "hidden";
	popupContainer.style.zIndex = "10";
	popupContainer.style.opacity = "1";
	popup.style.marginTop = "64px";
	popup.appendChild(content);
}

function closePopup() {
	//document.body.style.overflow = "auto";
	popupContainer.style.zIndex = "-1";
	popupContainer.style.opacity = "0";
	popup.style.marginTop = "-500px";
	popup.innerHTML = '';
}

popupContainer.addEventListener("click", () => {
	closePopup();
});

buildMePage(content);

/**
 * Build the avatars page
 * @param content   The content to build on
 * @param offset    Avatar page offset
 */
function buildAvatarsPage(content, offset) {
	loadingAvatars = true;
	startLoading();
	api.getAvatars(10, offset, (data) => {
		content.innerHTML = '';
		const container = createElement("div", "avatars-container");
		for (let i = 0; i < data.length; i++) {
			const avatar = data[i];

			const avatarEntry = createElement("div", "avatar-entry");

			const avatarNameContainer = createElement("div", "avatar-name-container");
			const avatarName = createElement("a", "avatar-name", avatar.name);
			avatarNameContainer.appendChild(avatarName);

			const avatarImage = createElement("img", "avatar-image");
			avatarImage.setAttribute("src", avatar.thumbnailImageUrl);
			const avatarReleaseStatusContainer = createElement("div", "avatar-status-container");
			const avatarReleaseStatus = createElement("a", "avatar-release-status", avatar.releaseStatus);
			avatarReleaseStatusContainer.appendChild(avatarReleaseStatus);

			avatarEntry.appendChild(avatarNameContainer);
			avatarEntry.appendChild(avatarImage);
			avatarEntry.appendChild(avatarReleaseStatusContainer);

			const dlContainer = createElement("div", "dl-container");
			const dlButton = createElement("div", "dl-button");
			const dlText = createElement("a", "dl-text", ".unitypackage");
			const dlLogo = createElement("img", "dl-logo");
			dlLogo.setAttribute("src", "./css/flaticon/png/UnityLogo.png");
			dlButton.appendChild(dlLogo);
			dlButton.appendChild(dlText);
			dlContainer.appendChild(dlButton);
			avatarEntry.appendChild(dlContainer);
			container.appendChild(avatarEntry);
			dlButton.addEventListener("click", () => {
				startLoading();
				api.getAvatar(avatar.id, (data) => {
					console.log(JSON.stringify(data));
					if (data.unityPackageUrl === "") {
						sendNotification("This avatar cannot be downloaded for unknown reasons.", "alert-error");
						stopLoading();
						return
					}
					main.download(data.unityPackageUrl);
					sendNotification("Started download.", "alert-ok");
					stopLoading();
				})
			})
		}
		const pageNav = createElement("div", "page-nav-container");
		const prev = createElement("div", "page-nav-prev", "Previous");
		const pageContainer = createElement("div", "current-page-container");
		const page = createElement("a", "current-page", avatarPage + 1);
		pageContainer.appendChild(page);
		prev.addEventListener("click", () => {
			if (loadingAvatars === true) {
				return;
			}
			if (avatarPage === 0) {
				return
			}
			avatarPage--;
			buildAvatarsPage(content, avatarPage * 10)
		});
		const next = createElement("div", "page-nav-next", "Next");
		next.addEventListener("click", () => {
			if (loadingAvatars === true) {
				return;
			}
			avatarPage++;
			buildAvatarsPage(content, avatarPage * 10);
		});
		pageNav.appendChild(prev);
		pageNav.appendChild(pageContainer);
		pageNav.appendChild(next);
		container.appendChild(pageNav);
		content.appendChild(container);
		loadingAvatars = false;
		stopLoading();
	})
}

/**
 * Build the worlds page
 * @param content   The content to build on
 */
// TODO cleanup
function buildWorldsPage(content) {
	startLoading();
	api.getWorlds(20, (data) => {
		content.innerHTML = '';
		const container = createElement("div", "avatars-container");
		for (let i = 0; i < data.length; i++) {
			const world = data[i];

			const avatarEntry = createElement("div", "avatar-entry");

			const avatarNameContainer = createElement("div", "avatar-name-container");
			const avatarName = createElement("a", "avatar-name", world.name);
			avatarNameContainer.appendChild(avatarName);

			const avatarImage = createElement("img", "avatar-image");
			avatarImage.setAttribute("src", world.thumbnailImageUrl);
			const avatarReleaseStatusContainer = createElement("div", "avatar-status-container");
			const avatarReleaseStatus = createElement("a", "avatar-release-status", world.releaseStatus);
			avatarReleaseStatusContainer.appendChild(avatarReleaseStatus);

			avatarEntry.appendChild(avatarNameContainer);
			avatarEntry.appendChild(avatarImage);
			avatarEntry.appendChild(avatarReleaseStatusContainer);

			const dlContainer = createElement("div", "dl-container");
			const dlButton = createElement("div", "dl-button");
			const dlText = createElement("a", "dl-text", ".unitypackage");
			const dlLogo = createElement("img", "dl-logo");
			dlLogo.setAttribute("src", "./css/flaticon/png/UnityLogo.png");
			dlButton.appendChild(dlLogo);
			dlButton.appendChild(dlText);
			dlContainer.appendChild(dlButton);
			avatarEntry.appendChild(dlContainer);
			container.appendChild(avatarEntry);
			dlButton.addEventListener("click", () => {
				startLoading();
				api.getOwnWorld(world.id, (data) => {
					if (data.unityPackageUrl === "") {
						sendNotification("This world cannot be downloaded for unknown reasons.", "alert-error");
						stopLoading();
						return
					}
					main.download(data.unityPackageUrl);
					sendNotification("Started download.", "alert-ok");
					stopLoading();
				})
			})
		}
		content.appendChild(container);
		stopLoading();
	})
}

/**
 * Build the main page
 * @param content   The content to build on
 */
function buildMePage(content) {
	content.innerHTML = '';
	const center = createElement("div", "center");
	const centerChild = createElement("div", "center-child");
	const welcome = createElement("div", "welcome");
	const names = createElement("div", "names");
	const picture = createElement("div", "profile-picture");

	const loginInfo = api.getLoginInfo();

	names.appendChild(createElement("a", "display-name", loginInfo.displayName));
	names.appendChild(createElement("a", "user-name", loginInfo.username));

	const pic = createElement("img", "profile-picture-img");
	pic.setAttribute("src", loginInfo.avatarImage);
	picture.appendChild(pic);
	picture.addEventListener('click', () => {
		sendNotification("This is not an easter egg", "alert-ok");
	});

	const wTextCont = createElement("div", "welcome-text-container");
	wTextCont.appendChild(createElement("a", "welcome-text", "Welcome"));
	welcome.appendChild(wTextCont);
	welcome.appendChild(picture);
	welcome.appendChild(names);
	centerChild.appendChild(welcome);
	center.appendChild(centerChild);
	content.appendChild(center);
}

/**
 * Build friends page
 * @param content   The content to build on
 */
function buildFriendsPage(content) {
	startLoading();
	api.getFriends((data) => {
		content.innerHTML = '';
		const container = createElement("div", "friends-container");
		const worldsToLoad = [];
		for (let i = 0; i < data.length; i++) {
			const friend = data[i];

			const friendEntry = createElement("div", "friend-entry");

			const friendNameContainer = createElement("div", "friend-name-container");
			const friendName = createElement("a", "friend-name", friend.displayName);
			friendNameContainer.appendChild(friendName);

			const friendImageContainer = createElement("div", "friend-image-container");
			const friendImage = createElement("img", "friend-image");
			friendImage.setAttribute("src", friend.currentAvatarThumbnailImageUrl);
			friendImageContainer.appendChild(friendImage);

			const friendWorldContainer = createElement("div", "friend-world-container");
			const friendWorldName = createElement("a", "friend-world", "Loading world...");
			const friendWorldInstance = createElement("a", "friend-world-instance", "Unknown");
			const friendWorldMode = createElement("a", "friend-world-mode", "Unknown");
			friendWorldContainer.appendChild(friendWorldName);
			const world = friend.location;
			if (world === "private") {
				friendWorldName.innerText = "Private world";
				friendWorldName.setAttribute("class", "friend-world-nothing");
				friendWorldName.addEventListener('click', () => {
					sendNotification("Private worlds cannot be viewed due to API limitations.", "alert-error");
				});
			} else {
				const regex = /(.+?):(.+?)($|~(.+?)\((.+?)\))/g;
				const groups = regex.exec(world);
				console.log(world);
				const id = groups[1];
				const instance = groups[2];
				const mode = groups[4];
				let clearMode = '';
				if (mode !== undefined) {
					switch (mode) {
						case 'hidden' :
							clearMode = "Friends+";
							break;
						case 'friends':
							clearMode = "Friends Only";
							break;
						default:
							clearMode = "Unknown";
					}
					friendWorldName.addEventListener("click", () => {
						startLoading();
						const regex1 = /(.+?):(.+)$/g;
						const gs = regex1.exec(world);
						api.getWorldMetadata(gs[1], gs[2], (data) => {
							const listUsers = [];
							if (data === false) {
								console.log(false);
								stopLoading();
								return;
							}
							for (let j = 0; j < data.users.length; j++) {
								const user = data.users[j];
								listUsers.push(user.displayName);
							}
							const popup = createElement("div", "popup-container-inner");
							const popupInfoContainer = createElement("div", "popup-info-container");
							const popupInfo = createElement("a", "popup-info", "Users in instance #" + instance);
							popupInfoContainer.appendChild(popupInfo);
							popup.appendChild(popupInfoContainer);
							const userListContainer = createElement("div", "user-list-container");
							for (let k = 0; k < listUsers.length; k++) {
								const lUser = listUsers[k];
								userListContainer.appendChild(createElement("a", "user-list-entry", lUser))
							}
							popup.appendChild(userListContainer);
							setPopup(popup);
							stopLoading();
						})
					});
				} else {
					clearMode = "Public";
					friendWorldName.setAttribute("class", "friend-world-nothing");
					friendWorldName.addEventListener('click', () => {
						sendNotification("Public worlds cannot be viewed due to API limitations", "alert-error");
					});
				}
				friendWorldMode.innerText = clearMode;
				friendWorldInstance.innerText = instance;
				friendWorldContainer.appendChild(friendWorldInstance);
				friendWorldContainer.appendChild(friendWorldMode);
				if (worldsToLoad[id] === undefined) {
					worldsToLoad[id] = [];
				}
				worldsToLoad[id].push(friendWorldName);
			}
			friendEntry.appendChild(friendNameContainer);
			friendEntry.appendChild(friendImage);
			friendEntry.appendChild(friendWorldContainer);
			container.appendChild(friendEntry);
		}

		for (let key in worldsToLoad) {
			if (worldsToLoad.hasOwnProperty(key)) {
				const load = worldsToLoad[key];
				api.getWorld(key, (data) => {
					for (let i = 0; i < load.length; i++) {
						load[i].innerText = data.name;
						load[i].setAttribute("title", data.name);
					}
				});
			}
		}
		stopLoading();
		content.appendChild(container)
	})
}

/**
 * Builds the moderation page
 * @param content   The content to build on
 */
function buildModerationsPage(content) {
	startLoading();
	const container = createElement("div", "moderation-container");
	const againstContainer = createElement("div", "moderation-against-container");
	const againstHeaderContainer = createElement("div", "against-header-container");
	const againstHeader = createElement("a", "against-header", "Against me");
	againstHeaderContainer.appendChild(againstHeader);
	const againstList = createElement("div", "against-list");
	againstContainer.appendChild(againstHeaderContainer);
	againstContainer.appendChild(againstList);
	const cardContainer = createElement("div", "card-container");
	api.modGetAgainstMe((data) => {
		const users = {};
		for (let i = 0; i < data.length; i++) {
			const mod = data[i];
			const name = mod.sourceDisplayName;
			if (users[name] === undefined) {
				users[name] = {
					mute: false,
					block: false,
					timestamp: mod.created
				};
			}
			switch (mod.type) {
				case 'block':
					users[name].block = true;
					break;
				case 'unmute':
					users[name].mute = false;
					break;
				case 'mute':
					users[name].mute = true;
					break;
			}
		}
		const usersSorted = [];
		for (let key in users) {
			if (users.hasOwnProperty(key)) {
				const usr = users[key];
				if (!(usr.mute === false && usr.block === false)) {
					usersSorted.push({
						name: key,
						mute: usr.mute,
						block: usr.block,
						timestamp: usr.timestamp
					})
				}
			}
		}
		for (let j = 0; j < usersSorted.length; j++) {
			const user = usersSorted[j];
			const userEntry = createElement("div", "user-entry");
			const userName = createElement("a", "user-entry-name", user.name);
			const d = new Date(user.timestamp).toString();
			userName.setAttribute("title", d);
			const userNameContainer = createElement("div", "user-entry-container");
			userNameContainer.appendChild(userName);
			userEntry.appendChild(userNameContainer);
			const iconContainer = createElement("div", "icons-container");
			if (user.mute === true) {
				const muteIconContainer = createElement("div", "icon-container");
				const muteIcon = createElement("img", "mute-icon");
				muteIcon.setAttribute("title", "This user has muted you");
				muteIcon.setAttribute("src", "./css/flaticon/png/mute.png");
				muteIconContainer.appendChild(muteIcon);
				iconContainer.appendChild(muteIconContainer);
			}
			if (user.block === true) {
				const blockIconContainer = createElement("div", "icon-container");
				const blockIcon = createElement("img", "block-icon");
				blockIcon.setAttribute("title", "This user has blocked you");
				blockIcon.setAttribute("src", "./css/flaticon/png/hide.png");
				blockIconContainer.appendChild(blockIcon);
				iconContainer.appendChild(blockIconContainer);
			}
			userEntry.appendChild(iconContainer);
			againstList.appendChild(userEntry);
		}
		stopLoading();
	});
	const mineContainer = createElement("div", "moderation-mine-container");
	const mineHeaderContainer = createElement("div", "mine-header-container");
	const mineHeader = createElement("a", "against-header", "Mine");
	mineHeaderContainer.appendChild(mineHeader);
	mineContainer.appendChild(mineHeaderContainer);
	const mineList = createElement("div", "mine-list");
	mineContainer.appendChild(mineList);
	api.modGetMine((data) => {
		const users = {};
		for (let i = 0; i < data.length; i++) {
			const mod = data[i];
			const name = mod.targetDisplayName;
			if (users[name] === undefined) {
				users[name] = {
					mute: false,
					block: false,
					timestamp: mod.created
				};
			}
			switch (mod.type) {
				case 'block':
					users[name].block = true;
					break;
				case 'unmute':
					users[name].mute = false;
					break;
				case 'mute':
					users[name].mute = true;
					break;
			}
		}
		const usersSorted = [];
		for (let key in users) {
			if (users.hasOwnProperty(key)) {
				const usr = users[key];
				if (!(usr.mute === false && usr.block === false)) {
					usersSorted.push({
						name: key,
						mute: usr.mute,
						block: usr.block,
						timestamp: usr.timestamp
					})
				}
			}
		}
		for (let j = 0; j < usersSorted.length; j++) {
			const user = usersSorted[j];
			const userEntry = createElement("div", "user-entry");
			const userName = createElement("a", "user-entry-name", user.name);
			const d = new Date(user.timestamp).toString();
			userName.setAttribute("title", d);
			const userNameContainer = createElement("div", "user-entry-container");
			userNameContainer.appendChild(userName);
			userEntry.appendChild(userNameContainer);
			const iconContainer = createElement("div", "icons-container");
			if (user.mute === true) {
				const muteIconContainer = createElement("div", "icon-container");
				const muteIcon = createElement("img", "mute-icon");
				muteIcon.setAttribute("title", "You have muted this user");
				muteIcon.setAttribute("src", "./css/flaticon/png/mute.png");
				muteIconContainer.appendChild(muteIcon);
				iconContainer.appendChild(muteIconContainer);
			}
			if (user.block === true) {
				const blockIconContainer = createElement("div", "icon-container");
				const blockIcon = createElement("img", "block-icon");
				blockIcon.setAttribute("title", "You have blocked this user");
				blockIcon.setAttribute("src", "./css/flaticon/png/hide.png");
				blockIconContainer.appendChild(blockIcon);
				iconContainer.appendChild(blockIconContainer);
			}
			userEntry.appendChild(iconContainer);
			mineList.appendChild(userEntry);
		}
	});
	const headerContainer = createElement("div", "header-container");
	const header = createElement("a", "header", "Player moderations");
	headerContainer.appendChild(header);
	container.appendChild(headerContainer);
	cardContainer.appendChild(mineContainer);
	cardContainer.appendChild(againstContainer);
	container.appendChild(cardContainer);
	content.innerHTML = '';
	content.appendChild(container);
}

/**
 * Shortcut to create a HTML element
 * @param type                      Element type
 * @param classes                   Element class
 * @param innerText                 Element inner text
 * @return {Electron.WebviewTag}    The created element
 */
function createElement(type, classes, innerText) {
	const div = document.createElement(type);
	if (classes !== undefined) {
		div.setAttribute("class", classes);
	}
	if (innerText !== undefined) {
		div.innerText = innerText;
	}
	return div;
}