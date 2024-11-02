const express = require("express");
const router = express.Router();
const auth = require("../auth.js");

// User needs to login to obtain an authentication token
router.post("/login", (req, res) => {
   const { username, password } = req.body;
   const token = auth.generateAccessToken(username, password);
   if (!token) {
      return res.status(403).json({ message: 'Invalid username or password' });
   }
   res.json({ authToken: token });
});

router.get("/data", auth.authenticateToken, (req, res) => {
   if (!req.user.username) {
      // bad user
      console.log("Unauthorised request.");
      return res.sendStatus(403);
   }

   res.json({ data: "some data intended only for logged-in users."});
});

router.get("/adminData", auth.authenticateToken, (req, res) => {
   if (!req.user.username || !req.user.admin) {
      // bad user
      console.log("Unauthorised request.");
      return res.sendStatus(403);
   }

   res.json({ data: "some data intended only for admin users."});
});

module.exports = router;
