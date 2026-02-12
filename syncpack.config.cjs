// @ts-check

/** @type {import("syncpack").RcFile} */
module.exports = {
  versionGroups: [
    {
      label: "Use workspace protocol for internal packages",
      packages: ["**"],
      dependencies: ["@ofocus/*"],
      dependencyTypes: ["prod", "dev"],
      pinVersion: "workspace:*",
    },
  ],
  semverGroups: [
    {
      range: "^",
      packages: ["**"],
      dependencies: ["**"],
    },
  ],
};
