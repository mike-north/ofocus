-- JSON serialization helpers for OmniFocus AppleScript integration
-- These handlers must be defined at the top level (outside tell blocks)

on jsonString(val)
	if val is "" or val is missing value or val is "missing value" then
		return "null"
	else
		return "\"" & my escapeJson(val) & "\""
	end if
end jsonString

on jsonArray(theList)
	if (count of theList) is 0 then
		return "[]"
	end if
	set output to "["
	repeat with i from 1 to count of theList
		if i > 1 then set output to output & ","
		set output to output & "\"" & (my escapeJson(item i of theList)) & "\""
	end repeat
	return output & "]"
end jsonArray

on escapeJson(str)
	set output to ""
	set quoteChar to "\""
	set bslashChar to "\\"
	set tabChar to tab
	repeat with c in characters of (str as string)
		set ch to c as string
		if ch is quoteChar then
			set output to output & "\\\""
		else if ch is bslashChar then
			set output to output & "\\\\"
		else if ch is return then
			set output to output & "\\n"
		else if ch is linefeed then
			set output to output & "\\n"
		else if ch is tabChar then
			set output to output & "\\t"
		else
			-- Check for other control characters (ASCII 0-31) and skip them
			set charCode to id of ch
			if charCode < 32 then
				-- Skip control characters
			else
				set output to output & ch
			end if
		end if
	end repeat
	return output
end escapeJson
