const { CognitoJwtVerifier } = require("aws-jwt-verify");

const region = 'ap-southeast-2';
const userPoolId = 'ap-southeast-2_9Kw2Kzhl2';
const clientId = '25r8mkfj1fse8cnuatf5k5u26l';

// Create a verifier instance
const verifier = CognitoJwtVerifier.create({
   userPoolId,
   tokenUse: "id",
   clientId,
});

async function authenticateCookie(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    console.log("Cookie auth token missing.");
    return res.redirect("/login");
  }

  try {
    const payload = await verifier.verify(token);
    console.log(`Token verified for user: ${payload['cognito:username']} at URL ${req.url}`);
    req.user = {
      username: payload['cognito:username'],
      email: payload.email,
      sub: payload.sub,
    };
    next();
  } catch (err) {
    console.log(`JWT verification failed at URL ${req.url}`, err.name, err.message);
    return res.redirect("/login");
  }
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    console.log("JSON web token missing.");
    return res.sendStatus(401);
  }

  try {
    const payload = await verifier.verify(token);
    console.log(`Token verified for user: ${payload['cognito:username']} at URL ${req.url}`);
    req.user = {
      username: payload['cognito:username'],
      email: payload.email,
      sub: payload.sub,
    };
    next();
  } catch (err) {
    console.log(`JWT verification failed at URL ${req.url}`, err.name, err.message);
    return res.sendStatus(401);
  }
}

module.exports = {
   authenticateCookie,
   authenticateToken,
   verifier,
 };