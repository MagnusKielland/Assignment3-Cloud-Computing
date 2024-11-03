require('dotenv').config(); 

const express = require("express");
const cookieParser = require("cookie-parser");
const fileUpload = require("express-fileupload");
const path = require("path");
const { createBucket, tagBucket } = require('./database/s3');

const app = express();
const port = 3000;
app.use(express.json());
app.use(cookieParser());
app.use(fileUpload());

app.use(express.urlencoded({ extended: true }));

createBucket().then(tagBucket);

const webclientRoute = require("./routes/webclient.js");
const apiRoute = require("./routes/api.js");
const visualizeRoute = require("./routes/visualize.js")

app.use("/assets", express.static(path.join(__dirname, "public/assets")));

app.use("/api", apiRoute);
app.use("/visualize", visualizeRoute)
app.use("/", webclientRoute);

app.listen(port, () => {
   console.log(`Server listening on port ${port}.`);
});

