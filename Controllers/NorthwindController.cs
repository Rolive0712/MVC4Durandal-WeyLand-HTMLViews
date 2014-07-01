using DapperORMDataAccess;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Web.Mvc;

namespace MVCDurandal.Controllers
{
    public class NorthwindController : Controller
    {
        private readonly INorthWindRepository iNorthRep = new NorthwindRepository();

        public ActionResult Index()
        {
            string demo = "Here could be your Weyland!";
            return View(model: demo);
        }

        public JsonResult GetOrders(string viewname, int orderid)
        {
            try
            {
                return Json(iNorthRep.GetOrders(), JsonRequestBehavior.AllowGet);
            }
            catch (Exception ex)
            {
                return Json(ex.Message);
            }
        }

    }
}
