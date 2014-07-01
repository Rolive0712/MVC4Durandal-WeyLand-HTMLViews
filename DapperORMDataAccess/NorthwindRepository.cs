using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Dapper;
using System.Data;
using DapperORMDataAccess.Models;

namespace DapperORMDataAccess
{
    public class NorthwindRepository : INorthWindRepository
    {
        public IEnumerable<Orders> GetOrders()
        {
            BaseUtility.ConnStringType = "Northwind";
            using (var db = BaseUtility.OpenConnection())
            {
                return db.Query<Orders>("select OrderID, CustomerID, ShipName, ShipCity, ShipCountry FROM Orders");
            }
        }
    }
}
