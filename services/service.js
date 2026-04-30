const AppError = require("../Error/AppError");
const parseRequest = require("../helpers/parseRequest.helper");
const { dispatch } = require("./dispatcher");
const { deletedPasswordFromDatas } = require("../database/tables/USERS");


// #region Data access layer (generic queries)
/**
 * Get list of records from a table (generic query handler)
 *
 * @async
 * @param {import("express").Request} req
 * @returns {Promise<{ result: Object[], message: String }>}
 */
async function getList(req) {
  const { table, fields, filters, orderBy, orderDir } = parseRequest(req);

  const response = await dispatch(table, "get", {
    query: {
      fields,
      filters,
      orderBy,
      orderDir,
    },
  });

  const cleaned = await deletedPasswordFromDatas(response.result);

  return {
    result: cleaned,
    message: "Datas fetched successfully",
  };
}

/**
 * Get specific record(s) from a table
 *
 * @async
 * @param {import("express").Request} req
 * @returns {Promise<{ result: Object, message: String }>}
 */
async function getSpecific(req) {
  const { table, id, fields, filters, orderBy, orderDir } = parseRequest(req);

  if (!id) throw new AppError("1050", "Missing id");

  const response = await dispatch(table, "getOne", {
    params: {
      id
    },
    query: {
      fields,
      filters,
      orderBy,
      orderDir,
    },
  });

  const cleaned = await deletedPasswordFromDatas(response.result);

  return {
    result: cleaned,
    message: "Datas fetched successfully",
  };
}


async function postData(req) {
  const { table, body = {} } = parseRequest(req);
  const file = req.file ?? null;

  console.log("FILE RECEIVED:", file);

  if (body?.email !== undefined) {
    const emailCheck = checkGoodEmail(body.email);
    if (!emailCheck.isGoodEmail)
      throw new AppError(emailCheck.status, emailCheck.message);
  }

  const response = await dispatch(table, "create", {
    body,
    file
  });

  const cleaned = await deletedPasswordFromDatas(response.result);

  return {
    result: cleaned,
    message: "Data created successfully",
  };
}


async function putData(req) {
  const { table, id, filters, body } = parseRequest(req);

  if (body.email !== undefined) {
    const emailCheck = checkGoodEmail(body.email);
    if (!emailCheck.isGoodEmail)
      throw new AppError(emailCheck.status, emailCheck.message);
  }

  const response = await dispatch(table, "update", {
    params: {
      id
    },
    query: {
      filters,
    },
    body,
  });

  const cleaned = await deletedPasswordFromDatas(response.result);

  return {
    result: cleaned, 
    message: "Data updated successfully",
  };
}


async function softDelete(req) {
  const { table, id } = parseRequest(req);

  if (!id) throw new AppError("1050", "Missing id");

  const response = await dispatch(table, "update", {
    params: {
      id,
    },
    body: {
      deleted: 1
    }
  });

  const cleaned = await deletedPasswordFromDatas(response.result);

  return {
    result: cleaned,
    message: "Data updated successfully",
  };
}

// #endregion

module.exports = {
  getList,
  getSpecific,
  postData,
  putData,
  softDelete,
};
