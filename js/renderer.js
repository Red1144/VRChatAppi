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

// Dev tools
document.addEventListener("keydown", function (e) {
	if (e.which === 123) {
		main.getElectronMainWindow().toggleDevTools();
	} else if (e.which === 116) {
		location.reload();
	}
});

if (api.getUserSettings().useCarbon) {
	const node = document.getElementById("css-theme");
	const newNode = node.cloneNode();
	newNode.setAttribute("href", "./css/dark.css");
	document.head.appendChild(newNode);
}

/**
 * Navigation bar functions
 */
function closeNav() {
	document.getElementById("mySidenav").style.width = "0";
	document.getElementById("mySidenav").style.left = "-50px";
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
const navSettings = document.getElementById("settings");
navSettings.addEventListener("click", () => {
	buildSettingsPage(content);
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
	}, api.getUserSettings().notifTimeout * 1000);
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

document.getElementById("popup-close-btn").addEventListener('click', () => {
	closePopup();
});

function buildSettingsPage(content) {
	content.innerHTML = '';
	const settings = api.getUserSettings();
	let isChecked = settings.allowPost;
	let useCarbon = settings.useCarbon;
	const settingsArea = createElement("div", "settings-container");

	const useCarbonContainer = createElement("label", "setting-container", "Use a darker and flatter theme for the program. (Requires restart)");
	const useCarbonCheckbox = createElement("input");
	useCarbonCheckbox.setAttribute("type", "checkbox");
	if (settings.useCarbon) {
		useCarbonCheckbox.setAttribute("checked", "checked");
	}
	useCarbonCheckbox.onchange = () => {
		useCarbon = !useCarbon;
	};
	const useCarbonCheckmark = createElement("span", "checkmark");
	useCarbonContainer.appendChild(useCarbonCheckbox);
	useCarbonContainer.appendChild(useCarbonCheckmark);
	settingsArea.appendChild(useCarbonContainer);

	const allowPostContainer = createElement("label", "setting-container", "Allow the program to manage and modify data on your VRChat account.");
	const allowPostCheckbox = createElement("input");
	allowPostCheckbox.setAttribute("type", "checkbox");
	if (settings.allowPost) {
		allowPostCheckbox.setAttribute("checked", "checked");
	}
	allowPostCheckbox.onchange = () => {
		isChecked = !isChecked;
	};
	const allowPostCheckmark = createElement("span", "checkmark");
	allowPostContainer.appendChild(allowPostCheckbox);
	allowPostContainer.appendChild(allowPostCheckmark);
	settingsArea.appendChild(allowPostContainer);

	const avatarToShowContainer = createElement("label", "setting-container-number", "How many avatars to list at once. [1-100]");
	const avatarToShowInput = createElement("input");
	avatarToShowInput.setAttribute("type", "number");
	avatarToShowInput.setAttribute("value", settings.maxAvatars);
	avatarToShowContainer.appendChild(avatarToShowInput);
	settingsArea.appendChild(avatarToShowContainer);

	const worldToShowContainer = createElement("label", "setting-container-number", "How many worlds to list. [1-100]");
	const worldToShowInput = createElement("input");
	worldToShowInput.setAttribute("type", "number");
	worldToShowInput.setAttribute("value", settings.maxWorlds);
	worldToShowContainer.appendChild(worldToShowInput);
	settingsArea.appendChild(worldToShowContainer);

	const notifTimeoutContainer = createElement("label", "setting-container-number", "Notification timeout in seconds");
	const notifTimeoutInput = createElement("input");
	notifTimeoutInput.setAttribute("type", "number");
	notifTimeoutInput.setAttribute("value", settings.notifTimeout);
	notifTimeoutContainer.appendChild(notifTimeoutInput);
	settingsArea.appendChild(notifTimeoutContainer);

	const sortMethodContainer = createElement("label", "setting-container-select", "List sort mode");
	const sortMethodSelect = createElement("select", "select-dropdown");
	sortMethodSelect.setAttribute("value", settings.sortingOrder);

	const updated = createElement("option", "select-option", "Updated");
	updated.setAttribute("value", "updated");
	const created = createElement("option", "select-option", "Created");
	created.setAttribute("value", "created");
	const nothing = createElement("option", "select-option", "Nothing");
	nothing.setAttribute("value", "order");
	switch (settings.sortingOrder) {
		case "updated":
			updated.setAttribute("selected", "selected");
			break;
		case "created":
			created.setAttribute("selected", "selected");
			break;
		case "order":
			nothing.setAttribute("selected", "selected");
			break;
	}
	sortMethodSelect.appendChild(updated);
	sortMethodSelect.appendChild(created);
	sortMethodSelect.appendChild(nothing);
	sortMethodContainer.appendChild(sortMethodSelect);
	settingsArea.appendChild(sortMethodContainer);

	const clearWorldCacheContainer = createElement("div", "clear-cache-container");
	const clearWorldCacheButton = createElement("div", "clear-cache-button", "Clear cache");
	const saveSettings = createElement("div", "save-settings-button", "Save");
	saveSettings.addEventListener("click", () => {
		const regex = /^[1-9][0-9]?$|^100$/;
		const maxAvatars = avatarToShowInput.value;
		const maxWorlds = worldToShowInput.value;
		const notifTimeout = notifTimeoutInput.value;
		if (!regex.test(maxAvatars) || !regex.test(maxWorlds) || !regex.test(notifTimeout)) {
			sendNotification("Some fields have invalid characters.", "alert-error");
			return;
		}
		const newSettings = {
			useCarbon: useCarbon,
			allowPost: isChecked,
			maxAvatars: parseInt(maxAvatars),
			maxWorlds: parseInt(maxWorlds),
			notifTimeout: parseInt(notifTimeout),
			sortingOrder: sortMethodSelect.value
		};
		api.saveSettings(newSettings);
		sendNotification("Settings saved.", "alert-ok");
	});
	clearWorldCacheButton.addEventListener("click", () => {
		api.clearCache();
		sendNotification("World cache cleared successfully.", "alert-ok")
	});
	clearWorldCacheContainer.appendChild(saveSettings);
	clearWorldCacheContainer.appendChild(clearWorldCacheButton);
	settingsArea.appendChild(clearWorldCacheContainer);

	content.appendChild(settingsArea)
}

/**
 * Build the avatars page
 * @param content   The content to build on
 * @param offset    Avatar page offset
 */
function buildAvatarsPage(content, offset) {
	loadingAvatars = true;
	startLoading();
	const amount = api.getUserSettings().maxAvatars;
	const order = api.getUserSettings().sortingOrder;
	const canLoad = canSendRequests("a:" + amount + "o:" + offset + "o:" + order + "_avatars");
	api.getAvatars(amount, offset, order, !canLoad, (data) => {
		if (data.error !== undefined) {
			sendNotification("An error occurred, press F12 to see full details: " + data.error, "alert-error");
			console.log("ERROR REPORT:");
			console.log(data)
		}
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

			const editContainer = createElement("div", "edit-container");
			const editButton = createElement("div", "edit-button");
			const editText = createElement("a", "edit-text", "Edit Avatar");
			const editLogo = createElement("img", "edit-logo");
			editLogo.setAttribute("src", "./css/flaticon/png/content.png");
			editButton.appendChild(editLogo);
			editButton.appendChild(editText);
			editContainer.appendChild(editButton);
			avatarEntry.appendChild(editContainer);
			editButton.addEventListener("click", () => {
				if (!api.getUserSettings().allowPost) {
					sendNotification("You must allow the program to manage your VRChat account in the settings to use this feature.", "alert-error");
					return;
				}
				const popup = createElement("div", "popup-container-inner");
				const popupInfoContainer = createElement("div", "popup-info-container");
				const popupInfo = createElement("a", "popup-info", "Edit " + avatar.name);
				const settingsContainer = createElement("div", "avatar-settings-container");
				popupInfoContainer.appendChild(popupInfo);
				popup.appendChild(popupInfoContainer);

				const avatarNameContainer = createElement("label", "setting-container-name", "Avatar name");
				const avatarNameInput = createElement("input");

				avatarNameInput.setAttribute("type", "text");
				avatarNameInput.setAttribute("placeholder", avatar.name);
				avatarNameContainer.appendChild(avatarNameInput);
				settingsContainer.appendChild(avatarNameContainer);

				const avatarImageContainer = createElement("label", "setting-container-name", "Avatar image");
				const avatarImageInput = createElement("input");
				const avatarImageHelp = createElement("div", "avatar-image-help tooltip", "(help?)");
				const avatarImageHelpTooltip = createElement("span", "tooltiptext", "For best results the image should be 1200x900 pixels or have have an aspect ratio of 4:3.");
				avatarImageHelp.appendChild(avatarImageHelpTooltip);
				avatarImageInput.onchange = () => {
					const regex = /(https?:\/\/.*\.(?:png|jpg))/;
					if (regex.test(avatarImageInput.value)) {
						avatarImageInput.style.borderColor = "green";
					} else {
						avatarImageInput.style.borderColor = "red";
					}
				};
				avatarImageInput.setAttribute("type", "text");
				avatarImageInput.setAttribute("placeholder", avatar.imageUrl);
				avatarImageContainer.appendChild(avatarImageInput);
				settingsContainer.appendChild(avatarImageContainer);
				avatarImageContainer.appendChild(avatarImageHelp);

				const saveBtnContainer = createElement("div", "edit-container save-container");
				const saveBtn = createElement("div", "edit-button save-button");
				const saveBtnText = createElement("a", "edit-text", "Save");
				saveBtn.appendChild(saveBtnText);
				saveBtnContainer.appendChild(saveBtn);
				saveBtn.addEventListener('click', () => {
					const newSettings = {};
					const newName = avatarNameInput.value;
					const newImage = avatarImageInput.value;
					if (newName === '' && newImage === '') {
						sendNotification("Nothing interesting happens.", "alert-ok");
						return;
					}

					const regex = /(https?:\/\/.*\.(?:png|jpg))/;
					if (!regex.test(newImage) && newImage !== '') {
						sendNotification("Invalid image URL.", "alert-error");
						return;
					}

					if (newName !== '') {
						newSettings.name = newName;
					}

					if (newImage !== '') {
						newSettings.imageUrl = newImage;
					}

					startLoading();
					console.log(avatar.id);
					if (!canSendRequests("avatar_update")) {
						sendNotification("You cannot update an avatar for another " + whenNextRequest('avatar_update') + ".", "alert-error");
						stopLoading();
						return;
					}
					api.saveAvatar('' + avatar.id, newSettings, (data) => {
						if (data.error !== undefined) {
							sendNotification("An error occurred, press F12 to see full details: " + data.error, "alert-error");
						}
						console.log(newSettings);
						console.log(data);
						sendNotification("Avatar saved. Please give VRChat servers minute or two to update your avatar.", "alert-ok");
						stopLoading();
						closePopup();
					})
				});
				popup.appendChild(settingsContainer);
				popup.appendChild(saveBtnContainer);
				setPopup(popup);
			});

			const dlContainer = createElement("div", "dl-container");
			const dlButton = createElement("div", "dl-button");
			const dlText = createElement("a", "dl-text", "Download");
			const dlLogo = createElement("img", "dl-logo");
			dlLogo.setAttribute("src", "./css/flaticon/png/UnityLogo.png");
			dlButton.appendChild(dlLogo);
			dlButton.appendChild(dlText);
			dlContainer.appendChild(dlButton);
			avatarEntry.appendChild(dlContainer);
			container.appendChild(avatarEntry);
			dlButton.addEventListener("click", () => {
				if (!canSendRequests("avatardl")) {
					sendNotification("You cannot download an avatar for another " + whenNextRequest("avatardl") + ".", "alert-error");
					return;
				}
				startLoading();
				api.getAvatar(avatar.id, (data) => {
					if (data.error !== undefined) {
						sendNotification("An error occurred, press F12 to see full details: " + data.error, "alert-error");
					}

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
			buildAvatarsPage(content, avatarPage * api.getUserSettings().maxAvatars)
		});
		const next = createElement("div", "page-nav-next", "Next");
		next.addEventListener("click", () => {
			if (loadingAvatars === true) {
				return;
			}
			avatarPage++;
			buildAvatarsPage(content, avatarPage * api.getUserSettings().maxAvatars);
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
	const canLoad = canSendRequests("worlds");
	if (!canLoad) {
		sendNotification("You are seeing an older version of your world list. Try again in " + whenNextRequest("worlds") + " for an up to date version.", "alert-ok");
	}
	api.getWorlds(api.getUserSettings().maxWorlds, api.getUserSettings().sortingOrder, !canLoad, (data) => {
		if (data.error !== undefined) {
			sendNotification("An error occurred, press F12 to see full details: " + data.error, "alert-error");
			console.log("ERROR REPORT:");
			console.log(data)
		}
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
				if (!canSendRequests("worlddl")) {
					sendNotification("You cannot download a world for another " + whenNextRequest("worlddl") + ".", "alert-error");
					return;
				}
				startLoading();
				api.getOwnWorld(world.id, (data) => {
					if (data.error !== undefined) {
						sendNotification("An error occurred, press F12 to see full details: " + data.error, "alert-error");
					}
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
	const canSend = canSendRequests("friends-list");
	if (!canSend) {
		sendNotification("You are seeing an older version of your friends list. Try again in " + whenNextRequest("friends-list") + " for an up to date version.", "alert-ok")
	}
	api.getFriends((data) => {
		if (data.error !== undefined) {
			sendNotification("An error occurred, press F12 to see full details: " + data.error, "alert-error");
			console.log("ERROR REPORT:");
			console.log(data)
		}
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
					friendWorldName.addEventListener("click", (e) => {
						const regex1 = /(.+?):(.+)$/g;
						const gs = regex1.exec(world);
						if (e.shiftKey) {
							if (canSendRequests("world")) {
								startLoading();
								const key = gs[1];
								const load = worldsToLoad[key];
								api.getWorld(key, false, (data) => {
									if (data.error !== undefined) {
										sendNotification("An error occurred, press F12 to see full details: " + data.error, "alert-error");
									}
									for (let i = 0; i < load.length; i++) {
										load[i].innerText = data.name;
										load[i].setAttribute("title", data.name);
										load[i].setAttribute("class", "friend-world")
									}
									stopLoading();
								});
							} else {
								sendNotification("You cannot load a world for another " + whenNextRequest("world") + ".", "alert-error")
							}
							return;
						}
						startLoading();
						const canLoadMeta = canSendRequests(gs[2]);
						if (!canLoadMeta) {
							sendNotification("You are seeing an older version of this world. Try again in " + whenNextRequest(gs[2]) + " for an up to date version.", "alert-ok")
						}
						api.getWorldMetadata(gs[1], gs[2], !canLoadMeta, (data) => {
							if (data.error !== undefined) {
								sendNotification("An error occurred, press F12 to see full details: " + data.error, "alert-error");
							}
							const listUsers = [];
							if (data === false) {
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
					friendWorldName.addEventListener('click', (e) => {
						const regex1 = /(.+?):(.+)$/g;
						const gs = regex1.exec(world);
						if (e.shiftKey) {
							if (canSendRequests("world")) {
								startLoading();
								const key = gs[1];
								const load = worldsToLoad[key];
								api.getWorld(key, false, (data) => {
									if (data.error !== undefined) {
										sendNotification("An error occurred, press F12 to see full details: " + data.error, "alert-error");
									}
									for (let i = 0; i < load.length; i++) {
										load[i].innerText = data.name;
										load[i].setAttribute("title", data.name);
										load[i].setAttribute("class", "friend-world")
									}
									stopLoading();
								});
							} else {
								sendNotification("You cannot load a world for another " + whenNextRequest("world") + ".", "alert-error")
							}
							return;
						}
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
				api.getWorld(key, true, (data) => {
					if (data.error !== undefined) {
						sendNotification("An error occurred, press F12 to see full details: " + data.error, "alert-error");
					}
					for (let i = 0; i < load.length; i++) {
						if (data === null) {
							load[i].innerHTML = 'Shift click to load';
							load[i].setAttribute("class", "world-load")
						} else {
							load[i].innerText = data.name;
							load[i].setAttribute("title", data.name);
						}
					}
				});
			}
		}
		stopLoading();
		content.appendChild(container)
	}, !canSend)
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
		if (data.error !== undefined) {
			sendNotification("An error occurred, press F12 to see full details: " + data.error, "alert-error");
			console.log("ERROR REPORT:");
			console.log(data)
		}
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
		if (data.error !== undefined) {
			sendNotification("An error occurred, press F12 to see full details: " + data.error, "alert-error");
			console.log("ERROR REPORT:");
			console.log(data)
		}
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
// first page to load
buildMePage(content);