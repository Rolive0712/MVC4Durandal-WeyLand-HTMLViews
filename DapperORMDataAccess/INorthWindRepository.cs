using DapperORMDataAccess.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DapperORMDataAccess
{
    public interface INorthWindRepository
    {
        IEnumerable<Orders> GetOrders();
    }
}
