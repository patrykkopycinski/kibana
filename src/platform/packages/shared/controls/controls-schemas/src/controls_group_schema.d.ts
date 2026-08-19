import { z } from '@kbn/zod';
export declare const controlWidthSchema: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"small">, z.ZodLiteral<"medium">, z.ZodLiteral<"large">]>>;
export declare const pinnedControlSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    width: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"small">, z.ZodLiteral<"medium">, z.ZodLiteral<"large">]>>;
    grow: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const getControlsSchema: () => z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    width: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"small">, z.ZodLiteral<"medium">, z.ZodLiteral<"large">]>>;
    grow: z.ZodDefault<z.ZodBoolean>;
    type: z.ZodLiteral<"esql_control">;
    config: z.ZodDiscriminatedUnion<[z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        display_settings: z.ZodOptional<z.ZodObject<{
            placeholder: z.ZodOptional<z.ZodString>;
            hide_action_bar: z.ZodOptional<z.ZodBoolean>;
            hide_exclude: z.ZodOptional<z.ZodBoolean>;
            hide_exists: z.ZodOptional<z.ZodBoolean>;
            hide_sort: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strict>>;
        selected_options: z.ZodArray<z.ZodString>;
        single_select: z.ZodDefault<z.ZodBoolean>;
        variable_name: z.ZodString;
        variable_type: z.ZodUnion<readonly [z.ZodLiteral<"fields">, z.ZodLiteral<"values">, z.ZodLiteral<"functions">, z.ZodLiteral<"time_literal">, z.ZodLiteral<"multi_values">]>;
        control_type: z.ZodLiteral<"STATIC_VALUES">;
        available_options: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        display_settings: z.ZodOptional<z.ZodObject<{
            placeholder: z.ZodOptional<z.ZodString>;
            hide_action_bar: z.ZodOptional<z.ZodBoolean>;
            hide_exclude: z.ZodOptional<z.ZodBoolean>;
            hide_exists: z.ZodOptional<z.ZodBoolean>;
            hide_sort: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strict>>;
        selected_options: z.ZodArray<z.ZodString>;
        single_select: z.ZodDefault<z.ZodBoolean>;
        variable_name: z.ZodString;
        variable_type: z.ZodUnion<readonly [z.ZodLiteral<"fields">, z.ZodLiteral<"values">, z.ZodLiteral<"functions">, z.ZodLiteral<"time_literal">, z.ZodLiteral<"multi_values">]>;
        control_type: z.ZodLiteral<"VALUES_FROM_QUERY">;
        esql_query: z.ZodString;
    }, z.core.$strip>], "control_type">;
}, z.core.$strict>, z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    width: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"small">, z.ZodLiteral<"medium">, z.ZodLiteral<"large">]>>;
    grow: z.ZodDefault<z.ZodBoolean>;
    type: z.ZodLiteral<"options_list_control">;
    config: z.ZodPreprocess<z.ZodDiscriminatedUnion<[z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        use_global_filters: z.ZodDefault<z.ZodBoolean>;
        ignore_validations: z.ZodDefault<z.ZodBoolean>;
        values_source: z.ZodLiteral<import("@kbn/controls-constants").ControlValuesSource.ESQL>;
        esql_query: z.ZodString;
        display_settings: z.ZodOptional<z.ZodObject<{
            placeholder: z.ZodOptional<z.ZodString>;
            hide_action_bar: z.ZodOptional<z.ZodBoolean>;
            hide_exclude: z.ZodOptional<z.ZodBoolean>;
            hide_exists: z.ZodOptional<z.ZodBoolean>;
            hide_sort: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strict>>;
        exclude: z.ZodDefault<z.ZodBoolean>;
        exists_selected: z.ZodDefault<z.ZodBoolean>;
        run_past_timeout: z.ZodDefault<z.ZodBoolean>;
        search_technique: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"prefix">, z.ZodLiteral<"wildcard">, z.ZodLiteral<"exact">]>>;
        selected_options: z.ZodDefault<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>>;
        single_select: z.ZodDefault<z.ZodBoolean>;
        sort: z.ZodDefault<z.ZodObject<{
            by: z.ZodEnum<{
                _count: "_count";
                _key: "_key";
            }>;
            direction: z.ZodEnum<{
                asc: "asc";
                desc: "desc";
            }>;
        }, z.core.$strict>>;
    }, z.core.$strip>, z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        use_global_filters: z.ZodDefault<z.ZodBoolean>;
        ignore_validations: z.ZodDefault<z.ZodBoolean>;
        values_source: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<import("@kbn/controls-constants").ControlValuesSource.FIELD>]>>;
        data_view_id: z.ZodString;
        field_name: z.ZodString;
        display_settings: z.ZodOptional<z.ZodObject<{
            placeholder: z.ZodOptional<z.ZodString>;
            hide_action_bar: z.ZodOptional<z.ZodBoolean>;
            hide_exclude: z.ZodOptional<z.ZodBoolean>;
            hide_exists: z.ZodOptional<z.ZodBoolean>;
            hide_sort: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strict>>;
        exclude: z.ZodDefault<z.ZodBoolean>;
        exists_selected: z.ZodDefault<z.ZodBoolean>;
        run_past_timeout: z.ZodDefault<z.ZodBoolean>;
        search_technique: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"prefix">, z.ZodLiteral<"wildcard">, z.ZodLiteral<"exact">]>>;
        selected_options: z.ZodDefault<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>>;
        single_select: z.ZodDefault<z.ZodBoolean>;
        sort: z.ZodDefault<z.ZodObject<{
            by: z.ZodEnum<{
                _count: "_count";
                _key: "_key";
            }>;
            direction: z.ZodEnum<{
                asc: "asc";
                desc: "desc";
            }>;
        }, z.core.$strict>>;
    }, z.core.$strip>], "values_source">>;
}, z.core.$strict>, z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    width: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"small">, z.ZodLiteral<"medium">, z.ZodLiteral<"large">]>>;
    grow: z.ZodDefault<z.ZodBoolean>;
    type: z.ZodLiteral<"range_slider_control">;
    config: z.ZodPreprocess<z.ZodDiscriminatedUnion<[z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        use_global_filters: z.ZodDefault<z.ZodBoolean>;
        ignore_validations: z.ZodDefault<z.ZodBoolean>;
        values_source: z.ZodLiteral<import("@kbn/controls-constants").ControlValuesSource.ESQL>;
        esql_query: z.ZodString;
        value: z.ZodOptional<z.ZodArray<z.ZodString>>;
        step: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>, z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        use_global_filters: z.ZodDefault<z.ZodBoolean>;
        ignore_validations: z.ZodDefault<z.ZodBoolean>;
        values_source: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<import("@kbn/controls-constants").ControlValuesSource.FIELD>]>>;
        data_view_id: z.ZodString;
        field_name: z.ZodString;
        value: z.ZodOptional<z.ZodArray<z.ZodString>>;
        step: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>], "values_source">>;
}, z.core.$strict>, z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    width: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"small">, z.ZodLiteral<"medium">, z.ZodLiteral<"large">]>>;
    grow: z.ZodDefault<z.ZodBoolean>;
    type: z.ZodLiteral<"time_slider_control">;
    config: z.ZodObject<{
        start_percentage_of_time_range: z.ZodDefault<z.ZodNumber>;
        end_percentage_of_time_range: z.ZodDefault<z.ZodNumber>;
        is_anchored: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>;
}, z.core.$strict>], "type">;
export declare const getControlsGroupSchema: () => z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    width: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"small">, z.ZodLiteral<"medium">, z.ZodLiteral<"large">]>>;
    grow: z.ZodDefault<z.ZodBoolean>;
    type: z.ZodLiteral<"esql_control">;
    config: z.ZodDiscriminatedUnion<[z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        display_settings: z.ZodOptional<z.ZodObject<{
            placeholder: z.ZodOptional<z.ZodString>;
            hide_action_bar: z.ZodOptional<z.ZodBoolean>;
            hide_exclude: z.ZodOptional<z.ZodBoolean>;
            hide_exists: z.ZodOptional<z.ZodBoolean>;
            hide_sort: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strict>>;
        selected_options: z.ZodArray<z.ZodString>;
        single_select: z.ZodDefault<z.ZodBoolean>;
        variable_name: z.ZodString;
        variable_type: z.ZodUnion<readonly [z.ZodLiteral<"fields">, z.ZodLiteral<"values">, z.ZodLiteral<"functions">, z.ZodLiteral<"time_literal">, z.ZodLiteral<"multi_values">]>;
        control_type: z.ZodLiteral<"STATIC_VALUES">;
        available_options: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        display_settings: z.ZodOptional<z.ZodObject<{
            placeholder: z.ZodOptional<z.ZodString>;
            hide_action_bar: z.ZodOptional<z.ZodBoolean>;
            hide_exclude: z.ZodOptional<z.ZodBoolean>;
            hide_exists: z.ZodOptional<z.ZodBoolean>;
            hide_sort: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strict>>;
        selected_options: z.ZodArray<z.ZodString>;
        single_select: z.ZodDefault<z.ZodBoolean>;
        variable_name: z.ZodString;
        variable_type: z.ZodUnion<readonly [z.ZodLiteral<"fields">, z.ZodLiteral<"values">, z.ZodLiteral<"functions">, z.ZodLiteral<"time_literal">, z.ZodLiteral<"multi_values">]>;
        control_type: z.ZodLiteral<"VALUES_FROM_QUERY">;
        esql_query: z.ZodString;
    }, z.core.$strip>], "control_type">;
}, z.core.$strict>, z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    width: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"small">, z.ZodLiteral<"medium">, z.ZodLiteral<"large">]>>;
    grow: z.ZodDefault<z.ZodBoolean>;
    type: z.ZodLiteral<"options_list_control">;
    config: z.ZodPreprocess<z.ZodDiscriminatedUnion<[z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        use_global_filters: z.ZodDefault<z.ZodBoolean>;
        ignore_validations: z.ZodDefault<z.ZodBoolean>;
        values_source: z.ZodLiteral<import("@kbn/controls-constants").ControlValuesSource.ESQL>;
        esql_query: z.ZodString;
        display_settings: z.ZodOptional<z.ZodObject<{
            placeholder: z.ZodOptional<z.ZodString>;
            hide_action_bar: z.ZodOptional<z.ZodBoolean>;
            hide_exclude: z.ZodOptional<z.ZodBoolean>;
            hide_exists: z.ZodOptional<z.ZodBoolean>;
            hide_sort: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strict>>;
        exclude: z.ZodDefault<z.ZodBoolean>;
        exists_selected: z.ZodDefault<z.ZodBoolean>;
        run_past_timeout: z.ZodDefault<z.ZodBoolean>;
        search_technique: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"prefix">, z.ZodLiteral<"wildcard">, z.ZodLiteral<"exact">]>>;
        selected_options: z.ZodDefault<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>>;
        single_select: z.ZodDefault<z.ZodBoolean>;
        sort: z.ZodDefault<z.ZodObject<{
            by: z.ZodEnum<{
                _count: "_count";
                _key: "_key";
            }>;
            direction: z.ZodEnum<{
                asc: "asc";
                desc: "desc";
            }>;
        }, z.core.$strict>>;
    }, z.core.$strip>, z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        use_global_filters: z.ZodDefault<z.ZodBoolean>;
        ignore_validations: z.ZodDefault<z.ZodBoolean>;
        values_source: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<import("@kbn/controls-constants").ControlValuesSource.FIELD>]>>;
        data_view_id: z.ZodString;
        field_name: z.ZodString;
        display_settings: z.ZodOptional<z.ZodObject<{
            placeholder: z.ZodOptional<z.ZodString>;
            hide_action_bar: z.ZodOptional<z.ZodBoolean>;
            hide_exclude: z.ZodOptional<z.ZodBoolean>;
            hide_exists: z.ZodOptional<z.ZodBoolean>;
            hide_sort: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strict>>;
        exclude: z.ZodDefault<z.ZodBoolean>;
        exists_selected: z.ZodDefault<z.ZodBoolean>;
        run_past_timeout: z.ZodDefault<z.ZodBoolean>;
        search_technique: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"prefix">, z.ZodLiteral<"wildcard">, z.ZodLiteral<"exact">]>>;
        selected_options: z.ZodDefault<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>>;
        single_select: z.ZodDefault<z.ZodBoolean>;
        sort: z.ZodDefault<z.ZodObject<{
            by: z.ZodEnum<{
                _count: "_count";
                _key: "_key";
            }>;
            direction: z.ZodEnum<{
                asc: "asc";
                desc: "desc";
            }>;
        }, z.core.$strict>>;
    }, z.core.$strip>], "values_source">>;
}, z.core.$strict>, z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    width: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"small">, z.ZodLiteral<"medium">, z.ZodLiteral<"large">]>>;
    grow: z.ZodDefault<z.ZodBoolean>;
    type: z.ZodLiteral<"range_slider_control">;
    config: z.ZodPreprocess<z.ZodDiscriminatedUnion<[z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        use_global_filters: z.ZodDefault<z.ZodBoolean>;
        ignore_validations: z.ZodDefault<z.ZodBoolean>;
        values_source: z.ZodLiteral<import("@kbn/controls-constants").ControlValuesSource.ESQL>;
        esql_query: z.ZodString;
        value: z.ZodOptional<z.ZodArray<z.ZodString>>;
        step: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>, z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        use_global_filters: z.ZodDefault<z.ZodBoolean>;
        ignore_validations: z.ZodDefault<z.ZodBoolean>;
        values_source: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<import("@kbn/controls-constants").ControlValuesSource.FIELD>]>>;
        data_view_id: z.ZodString;
        field_name: z.ZodString;
        value: z.ZodOptional<z.ZodArray<z.ZodString>>;
        step: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>], "values_source">>;
}, z.core.$strict>, z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    width: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"small">, z.ZodLiteral<"medium">, z.ZodLiteral<"large">]>>;
    grow: z.ZodDefault<z.ZodBoolean>;
    type: z.ZodLiteral<"time_slider_control">;
    config: z.ZodObject<{
        start_percentage_of_time_range: z.ZodDefault<z.ZodNumber>;
        end_percentage_of_time_range: z.ZodDefault<z.ZodNumber>;
        is_anchored: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>;
}, z.core.$strict>], "type">>>;
