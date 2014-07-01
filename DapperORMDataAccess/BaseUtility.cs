using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Data.SqlClient;
using Dapper;
using System.Reflection;
using System.Threading.Tasks;

namespace DapperORMDataAccess
{
    public class MemberMap : SqlMapper.IMemberMap
    {
        private readonly MemberInfo member;
        private readonly string columnName;
        public MemberMap(MemberInfo member, string columnName)
        {
            this.member = member;
            this.columnName = columnName;
        }
        public string ColumnName { get { return columnName; } }
        public FieldInfo Field { get { return member as FieldInfo; } }
        public Type MemberType
        {
            get
            {
                switch (member.MemberType)
                {
                    case MemberTypes.Field: return ((FieldInfo)member).FieldType;
                    case MemberTypes.Property: return ((PropertyInfo)member).PropertyType;
                    default: throw new NotSupportedException();
                }
            }
        }
        public ParameterInfo Parameter { get { return null; } }
        public PropertyInfo Property { get { return member as PropertyInfo; } }
    }
    public class CustomTypeMap : SqlMapper.ITypeMap
    {
        private readonly Dictionary<string, SqlMapper.IMemberMap> members
            = new Dictionary<string, SqlMapper.IMemberMap>(StringComparer.OrdinalIgnoreCase);
        public Type Type { get { return type; } }
        private readonly Type type;
        private readonly SqlMapper.ITypeMap tail;
        public void Map(string newMap, string actualMap)
        {
            members[newMap] = new MemberMap(type.GetMember(actualMap).Single(), newMap);
        }
        public CustomTypeMap(Type type, SqlMapper.ITypeMap tail)
        {
            this.type = type;
            this.tail = tail;
        }
        public ConstructorInfo FindConstructor(string[] names, Type[] types)
        {
            return tail.FindConstructor(names, types);
        }

        public SqlMapper.IMemberMap GetConstructorParameter(
            ConstructorInfo constructor, string columnName)
        {
            return tail.GetConstructorParameter(constructor, columnName);
        }

        public SqlMapper.IMemberMap GetMember(string columnName)
        {
            SqlMapper.IMemberMap map;
            if (!members.TryGetValue(columnName, out map))
            { // you might want to return null if you prefer not to fallback to the
                // default implementation
                map = tail.GetMember(columnName);
            }
            return map;
        }
    }
    public class BaseUtility
    {
        private static SqlConnection db;

        public static string ConnectionString
        {
            get
            {
                string connString = "";

                if (!string.IsNullOrEmpty(ConnStringType) && ConnStringType.Equals("<name>"))
                    connString = @"<conn string>";
                if (!string.IsNullOrEmpty(ConnStringType) && ConnStringType.Equals("<name>"))
                    connString = @"<conn string>";
                if (!string.IsNullOrEmpty(ConnStringType) && ConnStringType.Equals("Northwind"))
                    connString = "Data Source=ROSHIT-PC;User ID=sa;password=chicken;Initial Catalog=Northwind;timeout=200";

                return connString;
            }
        }

        public static string ConnStringType { get; set; }

        public static SqlConnection OpenConnection()
        {
            db = new SqlConnection(ConnectionString);
            db.Open();
            return db;
        }

        public static void MapMismatchedColumns<T>()
        {
            var oldMap = SqlMapper.GetTypeMap(typeof(T));
            var map = new CustomTypeMap(typeof(T), oldMap);

            if (typeof(T).Name.Equals("ActiveProjects"))
            {
                map.Map("RecvDt", "DateRecv");
            }
            if (typeof(T).Name.Equals("SelectListItem"))
            {
                map.Map("RoleNm", "Text");
                map.Map("LOBName", "Text");
                map.Map("RoleID", "Value");
                map.Map("LOBNbr", "Value");

            }
            if (typeof(T).Name.Equals("AutoComplete"))
            {
                map.Map("EmployeeName", "DisplayName");
                map.Map("PersonId", "Value");
            }

            SqlMapper.SetTypeMap(map.Type, map);
        }
    }
}
