const schedule = require('node-schedule');
const { dispatch } = require('./dispatcher');
const AppError = require('../Error/AppError');


const RETENTION = {
  value: 5,
  unit: "minute",
};

function getDateLimit(retention) {
  const date = new Date();

  switch (retention.unit) {
    case "second":
      date.setSeconds(date.getSeconds() - retention.value);
      break;
    case "minute":
      date.setMinutes(date.getMinutes() - retention.value);
      break;
    case "hour":
      date.setHours(date.getHours() - retention.value);
      break;
    case "day":
      date.setDate(date.getDate() - retention.value);
      break;
    case "week":
      date.setDate(date.getDate() - retention.value * 7);
      break;
    case "month":
      date.setMonth(date.getMonth() - retention.value);
      break;
    case "year":
      date.setFullYear(date.getFullYear() - retention.value);
      break;
    default:
      throw new AppError("1200", `Unité de rétention inconnue : ${retention.unit}`);
  }

  return date;
}


/*
Tous les premiers du mois = 0 0 8 1 * *
*/
// Test toutes les 10 secondes = */10 * * * * *

const scheduleJob = schedule.scheduleJob("0 0 8 1 * *", async () => {   
  try {
    const limitDate = getDateLimit(RETENTION);

    const result = await dispatch("login_logs", "get", {
      query: {
        filters: [["changed_dt", "lte", limitDate]],
      },
    });

    const entries = result.result ?? [];
    console.log(`${entries.length} entrées à supprimer`);

    for (const entry of entries) {
      await dispatch("login_logs", "remove", {
        params: { id: entry.id },
      });
    }

    console.log("Nettoyage terminé");
  } catch (err) {
    console.error("Erreur lors du nettoyage :", err.message);
  }
});