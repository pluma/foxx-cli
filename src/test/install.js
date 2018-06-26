/* global describe, it, before, after, afterEach */
"use strict";

const path = require("path");
const Database = require("arangojs");
const expect = require("chai").expect;
const foxx = require("./util");
const helper = require("./helper");
const fs = require("fs");

const ARANGO_VERSION = Number(process.env.ARANGO_VERSION || 30000);
const ARANGO_URL = process.env.TEST_ARANGODB_URL || "http://localhost:8529";
const ARANGO_USERNAME = process.env.ARANGO_USERNAME || "root";

const mount = "/install-test";
const basePath = path.resolve(__dirname, "..", "..", "fixtures");
const serviceServiceMount = "/foxx-crud-test-download";
const servicePath = path.resolve(basePath, "minimal-working-service.zip");

describe("Foxx service installed", () => {
  const db = new Database({
    url: ARANGO_URL,
    arangoVersion: ARANGO_VERSION
  });

  let arangoPaths;
  before(async () => {
    await db.installService(
      serviceServiceMount,
      fs.readFileSync(path.resolve(basePath, "service-service-service.zip"))
    );
    arangoPaths = (await db.route(serviceServiceMount).get()).body;
  });

  after(async () => {
    try {
      await db.uninstallService(serviceServiceMount, { force: true });
    } catch (e) {
      // noop
    }
  });

  afterEach(async () => {
    try {
      await db.uninstallService(mount, { force: true });
    } catch (e) {
      // noop
    }
  });

  const cases = helper.crudCases();

  for (const c of cases) {
    it(`via ${c.name} should be available`, async () => {
      await foxx(`install ${mount} ${c.source(arangoPaths)}`);
      const res = await db.route(mount).get();
      expect(res.body).to.eql({ hello: "world" });
    });
  }

  it("via stdin should be available", async () => {
    const input = fs.readFileSync(
      path.resolve(basePath, "minimal-working-service.zip")
    );
    await foxx(`install ${mount} @`, false, { input });
    const res = await db.route(mount).get();
    expect(res.body).to.eql({ hello: "world" });
  });

  it("via alias should be available", async () => {
    await foxx(`i ${mount} ${servicePath}`);
    const res = await db.route(mount).get();
    expect(res.body).to.eql({ hello: "world" });
  });

  it("in development mode should be available", async () => {
    await foxx(`install --development ${mount} ${servicePath}`);
    const res = await db.route(mount).get();
    expect(res.body).to.eql({ hello: "world" });
    const info = await db.getService(mount);
    expect(info.development).to.equal(true);
  });

  it("in development mode (short option) should be available", async () => {
    await foxx(`install --dev ${mount} ${servicePath}`);
    const res = await db.route(mount).get();
    expect(res.body).to.eql({ hello: "world" });
    const info = await db.getService(mount);
    expect(info.development).to.equal(true);
  });

  it("with alternative server URL should be available", async () => {
    await foxx(`install --server ${ARANGO_URL} ${mount} ${servicePath}`);
    const res = await db.route(mount).get();
    expect(res.body).to.eql({ hello: "world" });
  });

  it("with alternative server URL (short option) should be available", async () => {
    await foxx(`install -H ${ARANGO_URL} ${mount} ${servicePath}`);
    const res = await db.route(mount).get();
    expect(res.body).to.eql({ hello: "world" });
  });

  it("with alternative database should be available", async () => {
    await foxx(`install --database _system ${mount} ${servicePath}`);
    const res = await db.route(mount).get();
    expect(res.body).to.eql({ hello: "world" });
  });

  it("with alternative database (short option) should be available", async () => {
    await foxx(`install -D _system ${mount} ${servicePath}`);
    const res = await db.route(mount).get();
    expect(res.body).to.eql({ hello: "world" });
  });

  it("with alternative username should be available", async () => {
    await foxx(`install --username ${ARANGO_USERNAME} ${mount} ${servicePath}`);
    const res = await db.route(mount).get();
    expect(res.body).to.eql({ hello: "world" });
  });

  it("with alternative username should be available (short option)", async () => {
    await foxx(`install -u ${ARANGO_USERNAME} ${mount} ${servicePath}`);
    const res = await db.route(mount).get();
    expect(res.body).to.eql({ hello: "world" });
  });

  describe("with a password file", () => {
    const user = "testuser";
    const passwordFilePath = path.resolve(basePath, "passwordFile");
    const passwd = fs.readFileSync(passwordFilePath, "utf-8");
    before(async () => {
      db.route("/_api/user").post({
        user,
        passwd
      });
      db.route(`/_api/user/${user}/database/_system`).put({ grant: "rw" });
    });
    after(async () => {
      try {
        db.route(`/_api/user/${user}`).delete();
      } catch (e) {
        // noop
      }
    });
    it("should be available", async () => {
      await foxx(
        `install --username ${user} --password-file ${passwordFilePath} ${mount} ${servicePath}`
      );
      const res = await db.route(mount).get();
      expect(res.body).to.eql({ hello: "world" });
    });
  });

  it("should run its setup script by default", async () => {
    const col = `${mount}_setup_teardown`.replace(/\//, "").replace(/-/g, "_");
    try {
      await db.collection(col).get();
      expect.fail();
    } catch (e) {
      expect(e.errorNum).to.equal(1203);
    }
    await foxx(
      `install ${mount} ${path.resolve(
        basePath,
        "minimal-working-setup-teardown.zip"
      )}`
    );
    const info = await db.collection(col).get();
    expect(info).to.have.property("name", col);
  });

  it("should run its setup script when enabled", async () => {
    const col = `${mount}_setup_teardown`.replace(/\//, "").replace(/-/g, "_");
    try {
      await db.collection(col).get();
      expect.fail();
    } catch (e) {
      expect(e.errorNum).to.equal(1203);
    }
    await foxx(
      `install --setup ${mount} ${path.resolve(
        basePath,
        "minimal-working-setup-teardown.zip"
      )}`
    );
    const info = await db.collection(col).get();
    expect(info).to.have.property("name", col);
  });

  it("should not run its setup script when disabled", async () => {
    const col = `${mount}_setup_teardown`.replace(/\//, "").replace(/-/g, "_");
    try {
      await db.collection(col).get();
      expect.fail();
    } catch (e) {
      expect(e.errorNum).to.equal(1203);
    }
    await foxx(
      `install --no-setup ${mount} ${path.resolve(
        basePath,
        "minimal-working-setup-teardown.zip"
      )}`
    );
    try {
      await db.collection(col).get();
      expect.fail();
    } catch (e) {
      expect(e.errorNum).to.equal(1203);
    }
  });

  it("with configuration should not be set by default", async () => {
    await foxx(
      `install ${mount} ${path.resolve(basePath, "with-configuration.zip")}`
    );
    const configuration = await db.getServiceConfiguration(mount, true);
    expect(configuration).to.not.have.property("test1");
    expect(configuration).to.not.have.property("test2");
  });

  it("with configuration should have one config set", async () => {
    await foxx(
      `install --cfg test1="test1" ${mount} ${path.resolve(
        basePath,
        "with-configuration.zip"
      )}`
    );
    const configuration = await db.getServiceConfiguration(mount, true);
    expect(configuration).to.have.property("test1", "test1");
    expect(configuration).to.not.have.property("test2");
  });

  it("with configuration should have two configs set", async () => {
    await foxx(
      `install --cfg test1="test1" --cfg test2="test2" ${mount} ${path.resolve(
        basePath,
        "with-configuration.zip"
      )}`
    );
    const configuration = await db.getServiceConfiguration(mount, true);
    expect(configuration).to.have.property("test1", "test1");
    expect(configuration).to.have.property("test2", "test2");
  });

  it("with configuration should have one config set (short option)", async () => {
    await foxx(
      `install -c test1="test1" ${mount} ${path.resolve(
        basePath,
        "with-configuration.zip"
      )}`
    );
    const configuration = await db.getServiceConfiguration(mount, true);
    expect(configuration).to.have.property("test1", "test1");
    expect(configuration).to.not.have.property("test2");
  });

  it("with configuration should have two configs set (short option)", async () => {
    await foxx(
      `install -c test1="test1" -c test2="test2" ${mount} ${path.resolve(
        basePath,
        "with-configuration.zip"
      )}`
    );
    const configuration = await db.getServiceConfiguration(mount, true);
    expect(configuration).to.have.property("test1", "test1");
    expect(configuration).to.have.property("test2", "test2");
  });

  it("with configuration should have two configs set (mixed options)", async () => {
    await foxx(
      `install --cfg test1="test1" -c test2="test2" ${mount} ${path.resolve(
        basePath,
        "with-configuration.zip"
      )}`
    );
    const configuration = await db.getServiceConfiguration(mount, true);
    expect(configuration).to.have.property("test1", "test1");
    expect(configuration).to.have.property("test2", "test2");
  });

  it("with dependencies should have not be set by default", async () => {
    await foxx(
      `install ${mount} ${path.resolve(basePath, "with-dependencies.zip")}`
    );
    const dependencies = await db.getServiceDependencies(mount, true);
    expect(dependencies).to.not.have.property("test1");
    expect(dependencies).to.not.have.property("test2");
  });

  it("with dependencies should have one dependency set", async () => {
    await foxx(
      `install --dep test1=/test1 ${mount} ${path.resolve(
        basePath,
        "with-dependencies.zip"
      )}`
    );
    const dependencies = await db.getServiceDependencies(mount, true);
    expect(dependencies).to.have.property("test1", "/test1");
    expect(dependencies).to.not.have.property("test2");
  });

  it("with dependencies should have two dependencies set", async () => {
    await foxx(
      `install --dep test1=/test1 --dep test2=/test2 ${mount} ${path.resolve(
        basePath,
        "with-dependencies.zip"
      )}`
    );
    const dependencies = await db.getServiceDependencies(mount, true);
    expect(dependencies).to.have.property("test1", "/test1");
    expect(dependencies).to.have.property("test2", "/test2");
  });

  it("with dependencies should have one dependency set (short option)", async () => {
    await foxx(
      `install -d test1=/test1 ${mount} ${path.resolve(
        basePath,
        "with-dependencies.zip"
      )}`
    );
    const dependencies = await db.getServiceDependencies(mount, true);
    expect(dependencies).to.have.property("test1", "/test1");
    expect(dependencies).to.not.have.property("test2");
  });

  it("with dependencies should have two dependencies set (short option)", async () => {
    await foxx(
      `install -d test1=/test1 -d test2=/test2 ${mount} ${path.resolve(
        basePath,
        "with-dependencies.zip"
      )}`
    );
    const dependencies = await db.getServiceDependencies(mount, true);
    expect(dependencies).to.have.property("test1", "/test1");
    expect(dependencies).to.have.property("test2", "/test2");
  });

  it("with dependencies should have two dependencies set (mixed options)", async () => {
    await foxx(
      `install --dep test1=/test1 -d test2=/test2 ${mount} ${path.resolve(
        basePath,
        "with-dependencies.zip"
      )}`
    );
    const dependencies = await db.getServiceDependencies(mount, true);
    expect(dependencies).to.have.property("test1", "/test1");
    expect(dependencies).to.have.property("test2", "/test2");
  });

  it("correctly handles HTTPS URLs", async () => {
    await foxx(
      `install ${mount} https://github.com/arangodb-foxx/demo-itzpapalotl/archive/master.zip`
    );
    const res = await db.route(`${mount}/Itzpaplotl/summon`).get();
    expect(res.body).to.eql({ name: "Itzpaplotl", summoned: true });
  });
});
