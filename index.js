import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import vhost from "vhost";
import vhttps from "vhttps";
import serveIndex from "serve-index";
import { createServer } from "http";
import { config } from "dotenv";
config();

let hosts = fs.readFileSync(path.resolve(path.join("./host.json")));
hosts = JSON.parse(hosts.toString());

const primaryService = express();
primaryService.disable("x-powered-by");
primaryService.use((req, res, next) => {
  res.setHeader("x-powered-by", process.env.NODEJS_WEBHOST_NETWORK_NAME);
  next();
});
primaryService.options(
  "*",
  cors(function (req, callback) {
    callback(null, { origin: true });
  })
);

const corsWhitelist = [];

hosts.forEach((h) => {
  corsWhitelist.push(h.fqdn);
  if (h.enableWWW);
  corsWhitelist.push(`www.${h.fqdn}`);
});

const defaultCredential = process.env.NODEJS_WEBHOST_ENABLE_SSL
  ? {
      cert: fs.readFileSync(path.resolve(process.env.NODEJS_WEBHOST_CERT)).toString(),
      ca: fs.readFileSync(path.resolve(process.env.NODEJS_WEBHOST_CA)).toString(),
      key: fs.readFileSync(path.resolve(process.env.NODEJS_WEBHOST_KEY)).toString()
    }
  : {
      cert: undefined,
      ca: undefined,
      key: undefined
    };

function handleCorsDelegation(overrideCallback = null) {
  if (overrideCallback) {
    return overrideCallback;
  }
  return function (req, callback) {
    let corsOptions;
    if (corsWhitelist.indexOf(req.header("Origin")) !== -1) {
      corsOptions = { origin: true }; // reflect (enable) the requested origin in the CORS response
    } else {
      corsOptions = { origin: false }; // disable CORS for this request
    }
    callback(null, corsOptions); // callback expects two parameters: error and options
  };
}

let sslCredentials = hosts.map((h) => {
  return {
    cert: h.ssl.cert !== 'undefined' ? fs.readFileSync(h.ssl.cert).toString() : undefined,
    ca: h.ssl.cert !== 'undefined' ? fs.readFileSync(h.ssl.ca).toString() : undefined,
    key: h.ssl.cert !== 'undefined' ? fs.readFileSync(h.ssl.key).toString() : undefined
  };
});

let httpsServer;
let httpServer;
console.log("SSL ENABLED : ", process.env.NODEJS_WEBHOST_ENABLE_SSL);
if (process.env.NODEJS_WEBHOST_ENABLE_SSL === true) {
  console.log("SSL Sever Initiated");
  httpsServer = vhttps.createServer(
    defaultCredential,
    sslCredentials,
    primaryService
  );
  httpServer = createServer(primaryService);
} else {
  httpServer = createServer(primaryService);
}
const StartHost = (host) => {
  const vhostApp = express();
  vhostApp.disable("x-powered-by");
  vhostApp.set("X-Powered-By", process.env.NODEJS_WEBHOST_NETWORK_NAME);
  vhostApp.use(
    cors(handleCorsDelegation()),
    express.json(),
    express.urlencoded({
      extended: true
    }),
    express.static(host.fqdn, {
      dotfiles: "allow",
      redirect: host.redirect,
      index: "index.html"
    }),
    serveIndex(`${host.fqdn}/public/*`, { icons: true })
  );
  vhostApp.get("/*", (req, res, next) => {
    //try base static files first
    const baseFilePath = req.path;

    const reqPath = path.resolve(
      path.join(`${host.fqdn}/public`, baseFilePath) //req.path
    );

    if (fs.existsSync(reqPath) && !fs.lstatSync(reqPath).isDirectory()) {
      return res.sendFile(
        path.resolve(
          path.join(`${host.fqdn}/public`, baseFilePath) //req.path
        )
      );
    } else {
      return res.sendFile(
        path.resolve(
          path.join(`${host.fqdn}/public`, "index.html") //req.path
        )
      );
    }
  });
  console.log("Loading Virtual Host");
  primaryService.use(vhost(host.fqdn, vhostApp));
  console.log("Loading Virtual Host Subdomain");
  primaryService.use(vhost(`www.${host.fqdn}`, vhostApp));
};
hosts.forEach((h) => {
  StartHost(h);
});
if (process.env.NODEJS_WEBHOST_ENABLE_SSL === true) {
  httpsServer.listen(443, process.env.NODEJS_WEBHOST_BIND_TO_IP, () => {});
}
httpServer.listen(80, process.env.NODEJS_WEBHOST_BIND_TO_IP, () => {});

// primaryService.close();
