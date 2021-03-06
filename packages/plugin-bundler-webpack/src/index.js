import path from "path";
// import url from "url"

// import pkg from "@phenomic/core/package.json"
import findCacheDir from "find-cache-dir";
// import webpack, { BannerPlugin, optimize, DefinePlugin } from "webpack"
import webpack, { BannerPlugin, optimize } from "webpack";
import webpackDevMiddleware from "webpack-dev-middleware";
import webpackHotMiddleware from "webpack-hot-middleware";

import webpackPromise from "./webpack-promise.js";

const debug = require("debug")("phenomic:plugin:webpack");

const { UglifyJsPlugin } = optimize;
const cacheDir = findCacheDir({ name: "phenomic/webpack", create: true });
const bundleName = "phenomic.node";
const requireSourceMapSupport = `require('${require
  .resolve("source-map-support/register")
  // windows support
  .replace(/\\/g, "/")}');`;

const wrap = JSON.stringify;

const getWebpackConfig = (config: PhenomicConfig) => {
  let webpackConfig;
  try {
    webpackConfig = require(path.join(config.path, "webpack.config.js"))(
      config
    );
    debug("webpack.config.js used");
  } catch (e) {
    try {
      webpackConfig = require(path.join(
        config.path,
        "webpack.config.babel.js"
      ))(config);
      debug("webpack.config.babel.js used");
    } catch (e) {
      webpackConfig = require(path.join(__dirname, "webpack.config.js"))(
        config
      );
      debug("default webpack config used");
    }
  }
  debug(webpackConfig);
  return {
    ...webpackConfig,
    plugins: [
      ...(webpackConfig.plugins || []),
      new webpack.DefinePlugin({
        "process.env.NODE_ENV": wrap(process.env.NODE_ENV)
      })
    ]
  };
};

export default function() {
  return {
    name: "@phenomic/plugin-bundler-webpack",
    getMiddlewares(config: PhenomicConfig) {
      debug("get middlewares");
      const compiler = webpack(getWebpackConfig(config));
      return [
        webpackDevMiddleware(compiler, {
          stats: { chunkModules: false, assets: false }
          // @todo add this and output ourself a nice message for build status
          // noInfo: true,
          // quiet: true,
        }),
        webpackHotMiddleware(compiler, {
          reload: true
          // skip hot middleware logs if !verbose
          // log: config.verbose ? undefined : () => {},
        })
      ];
    },
    buildForPrerendering(config: PhenomicConfig) {
      debug("build for prerendering");
      const webpackConfig = getWebpackConfig(config);
      const specialConfig = {
        ...webpackConfig,
        target: "node",
        entry: {
          [bundleName]: path.join(config.path, "App.js")
        },
        output: {
          publicPath: "/",
          path: cacheDir,
          filename: "[name].js",
          library: "app",
          libraryTarget: "commonjs2"
        },
        plugins: [
          // Remove UglifyJSPlugin from plugin stack
          ...(webpackConfig.plugins
            ? webpackConfig.plugins.filter(
                plugin => !(plugin instanceof UglifyJsPlugin)
              )
            : []),
          // sourcemaps
          new BannerPlugin({
            banner: requireSourceMapSupport,
            raw: true,
            entryOnly: false
          })
        ],
        // sourcemaps
        devtool: "#source-map"
      };
      return webpackPromise(specialConfig).then(
        () => require(path.join(cacheDir, bundleName)).default
      );
    },
    build(config: PhenomicConfig) {
      debug("build");
      return webpackPromise(getWebpackConfig(config));
    }
  };
}
