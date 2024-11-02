require('dotenv').config();

const express = require("express");
const app = express();
const port = 3000;

app.use(express.json());

// Import the visualize route
const visualizeRoute = require("./visualize.js");

// Use the visualize route
app.use("/visualize", visualizeRoute);

// Start the server
app.listen(port, () => {
  console.log(`Service B listening on port ${port}.`);
});
