const express = require("express");
const app = express();
app.use(express.json());
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const convertDtObjToResponse = (dbObj) => {
  return {
    stateId: dbObj.state_id,
    stateName: dbObj.state_name,
    population: dbObj.population,
  };
};
const convertDistrictObjToResponse = (dbObj) => {
  return {
    districtName: dbObj.district_name,
    stateId: dbObj.state_id,
    cases: dbObj.cases,
    cured: dbObj.cured,
    active: dbObj.active,
    deaths: dbObj.deaths,
  };
};

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "my_secret", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
}
//login api
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
    SELECT * 
    FROM user
    WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "my_secret");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//get all states

app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT * 
    FROM state;`;
  const allStates = await db.all(getStatesQuery);
  response.send(
    allStates.map((eachState) => convertDtObjToResponse(eachState))
  );
});

//API3 :- Returns a state based on the state ID

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
    SELECT * 
    FROM state
    WHERE state_id = ${stateId};`;
  const dbState = await db.get(getStateQuery);
  response.send(convertDtObjToResponse(dbState));
});

//Create a district - api4
app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const createDistrictQuery = `
  INSERT INTO 
  district (
    district_name,
    state_id,
    cases,
    cured,
    active,
    deaths)
  VALUES (
    '${districtName}',
    ${stateId},
    ${cases},
    ${cured},
    ${active},
    ${deaths})`;
  await db.run(createDistrictQuery);
  response.send("District Successfully Added");
});

//api -5 :-district based on the district ID

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrict = `
    SELECT * 
    FROM district
    WHERE district_id = ${districtId}`;
    const dbDistrict = await db.get(getDistrict);
    response.send(convertDistrictObjToResponse(dbDistrict));
  }
);

//api - 6 : delete

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
    DELETE FROM district
    WHERE district_id = ${districtId};`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

//api -7 :- Updates the details of a specific district based on the district ID
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictQuery = `
    UPDATE district
    SET 
    district_name= '${districtName}',
    state_id= ${stateId},
    cases=${cases},
    cured=${cured},
    active=${active},
    deaths=${deaths})`;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);
//api -8 :-- statistics

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const totalQuery = `SELECT
        SUM(cases),
        SUM(cured),
        SUM(active),
        SUM(deaths)
    FROM district
    WHERE state_id = ${stateId}`;
    const dbResponse = await db.get(totalQuery);
    response.send({
      totalCases: dbResponse["SUM(cases)"],
      totalCured: dbResponse["SUM(cured)"],
      totalActive: dbResponse["SUM(active)"],
      totalDeaths: dbResponse["SUM(deaths)"],
    });
  }
);

module.exports = app;
