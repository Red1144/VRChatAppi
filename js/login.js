const { remote } = require('electron');
const api = remote.require('./vrchat-api.js');

const login = document.getElementById("login-btn");
const username = document.getElementById("username");
const password = document.getElementById("password");
const loading = document.getElementById("loading");

/**
 * Loading stats popup functions
 */

function startLoading() {
	loading.style.opacity = "1";
}

function stopLoading() {
	loading.style.opacity = "0";
}

login.addEventListener('click', () => {
	if (username.value === '' || password.value === '') {
		alert("Invalid username or password.");
		return;
	}
	startLoading();
	api.setClientToken(() => {
		api.login(username.value, password.value, (data) => {
			if (typeof data === 'string') {
				stopLoading();
				alert(data);
			} else {
				stopLoading();
				document.location = "app.html";
			}
		});
	});
});