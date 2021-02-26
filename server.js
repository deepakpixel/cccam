DOMAIN = "http://cccamworld.com";

const express = require("express");
const { parse } = require("node-html-parser");
const request = require("request");
const jwt = require("jsonwebtoken");
const socket = require("socket.io");

const JSONSECRET = "secret";
const app = express();

// MIDDLEWARES
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

PORT = process.env.PORT || 4444;
let server = app.listen(PORT, () => {
    console.log(`SERVER IS UP AND RUNNING <listening on port ${PORT}>`);
});

app.use((req, res) => res.sendStatus(404));
// SOCKET
const io = socket(server, {
    cors: {
        origin: "*",
    },
});

io.on("connection", (socket) => {
    // console.log("Client connected! ", socket.id);

    socket.on("create-cccam", async (data) => {
        let username, password, line_id, package_id, cuser, cpass;
        cuser = data.cuser || "undefined";
        cpass = data.cpass || "undefined";

        const mySession = request.jar();

        try {
            if (data.token) {
                let cred = await jwt.verify(data.token, JSONSECRET);
                username = cred.username;
                password = cred.password;
                package_id = cred.package_id;
                line_id = cred.line_id;
                socket.emit("response", {
                    progress: 1,
                    type: "success",
                    message: "Details validated",
                });
            } else {
                let cred = await createAccount();
                username = cred.username;
                password = cred.password;
                package_id = data.package_id;
                socket.emit("response", {
                    progress: 2,
                    type: "success",
                    message: cred.message,
                    desc: "Account-created",
                });
            }
            let login = await loginAccount(username, password, mySession);
            socket.emit("response", {
                progress: 3,
                type: "success",
                message: login.message,
                username,
                password,
                desc: "Account-loggedin",
            });
            // create cccam
            if (!data.token) {
                let temp_cccam = await createCCCAM(package_id, mySession);
                line_id = temp_cccam.line_id;
                socket.emit("response", {
                    progress: 4,
                    type: "success",
                    message: temp_cccam.message,
                    line_id,
                    desc: "CCCAM-created",
                });
            }
            // edit cccam
            let cccam = await editCCCAM(line_id, cuser, cpass, mySession);

            socket.emit("cccam", {
                progress: 5,
                type: "success",
                message: cccam.message,
                cccam: cccam.cccam,
                desc: "TASK COMPLETED",
            });
            token = jwt.sign(
                { line_id, package_id, username, password },
                JSONSECRET
            );
            socket.emit("updatetoken", token);
        } catch (error) {
            if (error.name == "usernameNotAvailable") {
                token = jwt.sign(
                    { line_id, package_id, username, password },
                    JSONSECRET
                );
                socket.emit("usernameNotAvailable", token);
            }
        }
    });
    socket.on("pingg", (data) => {
        socket.emit("pongg", data);
    });
});

function createAccount() {
    return new Promise((resolve, reject) => {
        let username = "d" + Date.now();
        let password = "1111";

        // resolve({ username, password, message: "message" });
        let url = `${DOMAIN}/index.php?action=register&login=${username}&pass=${password}&pass_conf=${password}&email=deepix${username}@gmail.com`;
        request(url, (error, response, body) => {
            if (error) reject(error);
            let message = parse(body).querySelector(".alert").rawText || "";
            resolve({ username, password, message });
        });
    });
}

function loginAccount(username, password, mySession) {
    return new Promise((resolve, reject) => {
        let url = `${DOMAIN}/index.php?action=login&login=${username}&pass=${password}`;
        request({ url: url, jar: mySession }, (error, response, body) => {
            if (error) reject(error);
            else resolve({ message: "Successfully logged in!" });
        });
    });
}
function createCCCAM(package_id, mySession) {
    return new Promise((resolve, reject) => {
        let url = `${DOMAIN}/userpanel/testlines.php?action=new_test_line&package_id=${package_id}`;
        request({ url: url, jar: mySession }, (error, response, body) => {
            if (error) reject(error);
            let message = parse(body).querySelector(".alert").rawText || "";
            let line_id = parse(body)
                .querySelector(".enable")
                .getAttribute("href")
                .split("=")
                .pop();
            resolve({ line_id, message });
        });
    });
}
function editCCCAM(line_id, cuser, cpass, mySession) {
    return new Promise((resolve, reject) => {
        let url = `${DOMAIN}/userpanel/testlines.php?action=edit&line_id=${line_id}&username=${cuser}&password=${cpass}`;
        request({ url: url, jar: mySession }, (error, response, body) => {
            if (error) reject(error);
            let message = parse(body).querySelector(".alert").rawText || "";
            if (
                message ==
                "* This line username is already in use. Please use another"
            ) {
                reject({ name: "usernameNotAvailable" });
                return;
            }

            let info = parse(body)
                .querySelector("tbody")
                .querySelector("tr")
                .childNodes[5].rawText.split(" ");
            let expiry = parse(body).querySelector("tbody").querySelector("tr")
                .childNodes[7].rawText;

            let cccam = {
                host: info[1],
                port: info[2],
                username: info[3],
                password: info[4],
                expiry,
            };

            resolve({ cccam, message });
        });
    });
}
