require('dotenv').config();

const express = require("express");
const cookieParser = require("cookie-parser");
const fileUpload = require("express-fileupload");
const path = require("path");

const app = express();
const port = 3000;

app.use(express.json());
app.use(cookieParser());
app.use(fileUpload());
app.use(express.urlencoded({ extended: true }));

// Import routes
const webclientRoute = require("./webclient.js");
const apiRoute = require("./api.js");

// Serve static assets
app.use("/assets", express.static(path.join(__dirname, "public/assets")));

// Use routes
app.use("/api", apiRoute);
app.use("/", webclientRoute);

// Start the server
app.listen(port, () => {
  console.log(`Service A listening on port ${port}.`);
});
