/// <reference path="../../Scripts/_references.js" />

define(function (system) {

    function getOrders() {

        var param = {
            viewname: "northwind",
            orderid: 1
        };
        //return $.getJSON("/Northwind/GetOrders", { viewname: "northwind", orderid: 1 }, function (result) {
        //});

        return $.ajax({
            url: "/Northwind/GetOrders",
            type: "POST",
            cache: false,
            data: JSON.stringify(param),
            async: true,
            dataType: "json",
            contentType: "application/json; charset=utf-8"

        });
    }

    var datacontext = {
        getOrders: getOrders
    };

    return datacontext;
});
